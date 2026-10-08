//! Servicio de bloqueo compartido entre el gancho de WebView2, los comandos y las tareas de fondo.

use std::sync::{Arc, RwLock};

use serde::{Deserialize, Serialize};

use crate::{
    blocker::{Blocker, ResourceType},
    lists::{load_lists, ListCache, ListCategory, FILTER_LISTS},
    stats::{today_local, BlockedStats},
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AdblockSettings {
    pub enabled: bool,
    pub lists: Vec<String>,
}

impl Default for AdblockSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            lists: FILTER_LISTS.iter().map(|l| l.id.to_string()).collect(),
        }
    }
}

pub trait BlockedNotifier: Send + Sync {
    fn blocked(&self, tab: u64, tab_count: u64);
}

pub struct AdblockService {
    blocker: RwLock<Arc<Blocker>>,
    settings: RwLock<AdblockSettings>,
    stats: BlockedStats,
    notifier: Arc<dyn BlockedNotifier>,
}

impl AdblockService {
    /// Arranca con un motor vacío; `install_blocker` lo sustituye cuando termina de construirse.
    pub fn new(settings: AdblockSettings, notifier: Arc<dyn BlockedNotifier>) -> Self {
        Self {
            blocker: RwLock::new(Arc::new(Blocker::empty())),
            settings: RwLock::new(settings),
            stats: BlockedStats::new(),
            notifier,
        }
    }

    pub fn check(&self, tab: u64, url: &str, source_url: &str, kind: ResourceType, method: &str) -> bool {
        if !self.settings.read().expect("settings lock").enabled {
            return false;
        }
        let blocker = self.blocker();
        let block = blocker.should_block(url, source_url, kind, method);
        if block {
            let n = self.stats.record(tab, &today_local());
            self.notifier.blocked(tab, n);
        }
        block
    }

    pub fn install_blocker(&self, b: Blocker) {
        *self.blocker.write().expect("blocker lock") = Arc::new(b);
    }

    pub fn blocker(&self) -> Arc<Blocker> {
        self.blocker.read().expect("blocker lock").clone()
    }

    pub fn settings(&self) -> AdblockSettings {
        self.settings.read().expect("settings lock").clone()
    }

    pub fn set_enabled(&self, enabled: bool) {
        self.settings.write().expect("settings lock").enabled = enabled;
    }

    /// Devuelve `Ok(true)` si cambió algo (hay que reconstruir el motor).
    pub fn set_list_enabled(&self, id: &str, enabled: bool) -> Result<bool, String> {
        if !FILTER_LISTS.iter().any(|l| l.id == id) {
            return Err(format!("unknown filter list: {id}"));
        }
        let mut s = self.settings.write().expect("settings lock");
        let present = s.lists.iter().any(|l| l == id);
        match (enabled, present) {
            (true, false) => {
                s.lists.push(id.to_string());
                Ok(true)
            }
            (false, true) => {
                s.lists.retain(|l| l != id);
                Ok(true)
            }
            _ => Ok(false),
        }
    }

    pub fn stats(&self) -> &BlockedStats {
        &self.stats
    }
}

/// Construcción costosa (≈1 s con las 7 listas): llamar desde un hilo bloqueante.
pub fn build_blocker(cache: &ListCache, settings: &AdblockSettings, extra_rules: Option<&str>) -> Blocker {
    let loaded = load_lists(cache, &settings.lists);
    let texts = loaded
        .iter()
        .map(|l| l.text.as_str())
        .chain(extra_rules.into_iter());
    Blocker::from_lists(texts)
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilterListStatus {
    pub id: String,
    pub name: String,
    pub category: ListCategory,
    pub enabled: bool,
    pub source: &'static str,
    pub fetched_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdblockStatus {
    pub enabled: bool,
    pub lists: Vec<FilterListStatus>,
    pub last_refresh: Option<i64>,
}

pub fn adblock_status(cache: &ListCache, settings: &AdblockSettings) -> AdblockStatus {
    let lists = FILTER_LISTS
        .iter()
        .map(|s| {
            let meta = cache.read_meta(s.id);
            FilterListStatus {
                id: s.id.to_string(),
                name: s.name.to_string(),
                category: s.category,
                enabled: settings.lists.iter().any(|l| l == s.id),
                source: if meta.is_some() { "downloaded" } else { "embedded" },
                fetched_at: meta.map(|m| m.fetched_at),
            }
        })
        .collect();
    AdblockStatus {
        enabled: settings.enabled,
        lists,
        last_refresh: cache.last_refresh(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lists::CachedMeta;
    use std::sync::Mutex;

    #[derive(Default)]
    struct Spy(Mutex<Vec<(u64, u64)>>);
    impl BlockedNotifier for Spy {
        fn blocked(&self, tab: u64, tab_count: u64) {
            self.0.lock().unwrap().push((tab, tab_count));
        }
    }

    fn service() -> (AdblockService, Arc<Spy>) {
        let spy = Arc::new(Spy::default());
        let svc = AdblockService::new(AdblockSettings::default(), spy.clone());
        svc.install_blocker(Blocker::from_lists(["||ads.example.com^"]));
        (svc, spy)
    }

    #[test]
    fn default_settings_enable_all_lists() {
        let s = AdblockSettings::default();
        assert!(s.enabled);
        assert_eq!(s.lists.len(), 7);
    }

    #[test]
    fn check_blocks_counts_and_notifies() {
        let (svc, spy) = service();
        assert!(svc.check(7, "https://ads.example.com/a.js", "https://n.es/", ResourceType::Script, "GET"));
        assert!(!svc.check(7, "https://cdn.n.es/a.js", "https://n.es/", ResourceType::Script, "GET"));
        assert_eq!(svc.stats().tab_count(7), 1);
        assert_eq!(*spy.0.lock().unwrap(), vec![(7, 1)]);
    }

    #[test]
    fn disabled_service_blocks_nothing() {
        let (svc, spy) = service();
        svc.set_enabled(false);
        assert!(!svc.check(7, "https://ads.example.com/a.js", "https://n.es/", ResourceType::Script, "GET"));
        assert!(spy.0.lock().unwrap().is_empty());
    }

    #[test]
    fn toggling_lists_validates_ids() {
        let (svc, _) = service();
        assert_eq!(svc.set_list_enabled("easylist", false), Ok(true));
        assert_eq!(svc.set_list_enabled("easylist", false), Ok(false));
        assert!(!svc.settings().lists.contains(&"easylist".to_string()));
        assert_eq!(svc.set_list_enabled("easylist", true), Ok(true));
        assert!(svc.set_list_enabled("inventada", true).is_err());
    }

    #[test]
    fn build_blocker_uses_cache_and_extra_rules() {
        let dir = tempfile::tempdir().unwrap();
        let cache = ListCache::new(dir.path());
        let rules: String = (0..20).map(|i| format!("||t{i}.example^\n")).collect();
        cache.write("easyprivacy", &rules, &CachedMeta { fetched_at: 9 }).unwrap();
        let settings = AdblockSettings { enabled: true, lists: vec!["easyprivacy".into()] };
        let b = build_blocker(&cache, &settings, Some("||extra.example^"));
        assert!(b.should_block("https://t3.example/x.js", "https://n.es/", ResourceType::Script, "GET"));
        assert!(b.should_block("https://extra.example/x.js", "https://n.es/", ResourceType::Script, "GET"));
    }

    #[test]
    fn status_reports_source_per_list() {
        let dir = tempfile::tempdir().unwrap();
        let cache = ListCache::new(dir.path());
        cache.write("easylist", "x", &CachedMeta { fetched_at: 11 }).unwrap();
        cache.set_last_refresh(11).unwrap();
        let st = adblock_status(&cache, &AdblockSettings { enabled: true, lists: vec!["easylist".into()] });
        assert_eq!(st.lists.len(), 7);
        let easylist = st.lists.iter().find(|l| l.id == "easylist").unwrap();
        assert!(easylist.enabled);
        assert_eq!(easylist.source, "downloaded");
        assert_eq!(easylist.fetched_at, Some(11));
        let privacy = st.lists.iter().find(|l| l.id == "easyprivacy").unwrap();
        assert!(!privacy.enabled);
        assert_eq!(privacy.source, "embedded");
        assert_eq!(st.last_refresh, Some(11));
        let json = serde_json::to_value(&st).unwrap();
        assert!(json.get("lastRefresh").is_some());
        assert!(json["lists"][0].get("fetchedAt").is_some());
    }
}
