//! Registro de listas de filtros, copia embebida y caché en disco.

use std::{
    fs,
    io,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ListCategory {
    Ads,
    Privacy,
    Cookies,
    Newsletters,
}

#[derive(Debug)]
pub struct FilterListSpec {
    pub id: &'static str,
    pub name: &'static str,
    pub url: &'static str,
    pub category: ListCategory,
    pub embedded: &'static str,
}

pub static FILTER_LISTS: &[FilterListSpec] = &[
    FilterListSpec {
        id: "easylist",
        name: "EasyList",
        url: "https://easylist.to/easylist/easylist.txt",
        category: ListCategory::Ads,
        embedded: include_str!("../assets/lists/easylist.txt"),
    },
    FilterListSpec {
        id: "easyprivacy",
        name: "EasyPrivacy",
        url: "https://easylist.to/easylist/easyprivacy.txt",
        category: ListCategory::Privacy,
        embedded: include_str!("../assets/lists/easyprivacy.txt"),
    },
    FilterListSpec {
        id: "ubo-filters",
        name: "uBlock Origin filters",
        url: "https://ublockorigin.github.io/uAssets/filters/filters.txt",
        category: ListCategory::Ads,
        embedded: include_str!("../assets/lists/ubo-filters.txt"),
    },
    FilterListSpec {
        id: "ubo-privacy",
        name: "uBlock Origin privacy",
        url: "https://ublockorigin.github.io/uAssets/filters/privacy.txt",
        category: ListCategory::Privacy,
        embedded: include_str!("../assets/lists/ubo-privacy.txt"),
    },
    FilterListSpec {
        id: "easylist-cookie",
        name: "EasyList Cookie",
        url: "https://secure.fanboy.co.nz/fanboy-cookiemonster.txt",
        category: ListCategory::Cookies,
        embedded: include_str!("../assets/lists/easylist-cookie.txt"),
    },
    FilterListSpec {
        id: "ubo-cookies",
        name: "uBlock Origin cookie notices",
        url: "https://ublockorigin.github.io/uAssets/filters/annoyances-cookies.txt",
        category: ListCategory::Cookies,
        embedded: include_str!("../assets/lists/ubo-cookies.txt"),
    },
    FilterListSpec {
        id: "fanboy-newsletter",
        name: "Fanboy Newsletter",
        url: "https://secure.fanboy.co.nz/fanboy-newsletter.txt",
        category: ListCategory::Newsletters,
        embedded: include_str!("../assets/lists/fanboy-newsletter.txt"),
    },
];

pub fn spec(id: &str) -> Option<&'static FilterListSpec> {
    FILTER_LISTS.iter().find(|l| l.id == id)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedMeta {
    pub fetched_at: i64,
}

#[derive(Debug, Clone)]
pub struct ListCache {
    dir: PathBuf,
}

impl ListCache {
    pub fn new(dir: impl Into<PathBuf>) -> Self {
        Self { dir: dir.into() }
    }

    fn text_path(&self, id: &str) -> PathBuf {
        self.dir.join(format!("{id}.txt"))
    }

    fn meta_path(&self, id: &str) -> PathBuf {
        self.dir.join(format!("{id}.meta.json"))
    }

    pub fn read_meta(&self, id: &str) -> Option<CachedMeta> {
        let raw = fs::read_to_string(self.meta_path(id)).ok()?;
        serde_json::from_str(&raw).ok()
    }

    pub fn read(&self, id: &str) -> Option<(String, CachedMeta)> {
        let meta = self.read_meta(id)?;
        let text = fs::read_to_string(self.text_path(id)).ok()?;
        Some((text, meta))
    }

    pub fn write(&self, id: &str, text: &str, meta: &CachedMeta) -> io::Result<()> {
        fs::create_dir_all(&self.dir)?;
        write_atomic(&self.text_path(id), text.as_bytes())?;
        let meta_json = serde_json::to_vec(meta).map_err(io::Error::other)?;
        write_atomic(&self.meta_path(id), &meta_json)
    }

    pub fn last_refresh(&self) -> Option<i64> {
        fs::read_to_string(self.dir.join("_last_refresh"))
            .ok()?
            .trim()
            .parse()
            .ok()
    }

    pub fn set_last_refresh(&self, ts: i64) -> io::Result<()> {
        fs::create_dir_all(&self.dir)?;
        write_atomic(&self.dir.join("_last_refresh"), ts.to_string().as_bytes())
    }
}

/// Escribe en `<path>.tmp` y renombra (en Windows `rename` reemplaza el destino).
fn write_atomic(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, bytes)?;
    fs::rename(&tmp, path)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ListSource {
    Downloaded { fetched_at: i64 },
    Embedded,
}

#[derive(Debug, Clone)]
pub struct LoadedList {
    pub id: &'static str,
    pub text: String,
    pub source: ListSource,
}

/// Para cada id habilitado y conocido: la copia descargada si existe; si no, la embebida.
pub fn load_lists(cache: &ListCache, enabled: &[String]) -> Vec<LoadedList> {
    enabled
        .iter()
        .filter_map(|id| spec(id))
        .map(|s| match cache.read(s.id) {
            Some((text, meta)) => LoadedList {
                id: s.id,
                text,
                source: ListSource::Downloaded { fetched_at: meta.fetched_at },
            },
            None => LoadedList {
                id: s.id,
                text: s.embedded.to_owned(),
                source: ListSource::Embedded,
            },
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_has_the_seven_lists_with_embedded_copies() {
        let ids: Vec<&str> = FILTER_LISTS.iter().map(|l| l.id).collect();
        assert_eq!(
            ids,
            vec![
                "easylist",
                "easyprivacy",
                "ubo-filters",
                "ubo-privacy",
                "easylist-cookie",
                "ubo-cookies",
                "fanboy-newsletter"
            ]
        );
        for l in FILTER_LISTS {
            assert!(l.embedded.len() > 10_000, "{} sin copia embebida", l.id);
            assert!(l.url.starts_with("https://"));
        }
        assert!(spec("easylist").is_some());
        assert!(spec("nope").is_none());
    }

    #[test]
    fn cache_round_trip_and_last_refresh() {
        let dir = tempfile::tempdir().unwrap();
        let cache = ListCache::new(dir.path());
        assert!(cache.read("easylist").is_none());
        assert_eq!(cache.last_refresh(), None);

        cache.write("easylist", "||a.com^\n", &CachedMeta { fetched_at: 42 }).unwrap();
        let (text, meta) = cache.read("easylist").unwrap();
        assert_eq!(text, "||a.com^\n");
        assert_eq!(meta.fetched_at, 42);
        assert_eq!(cache.read_meta("easylist").unwrap().fetched_at, 42);

        cache.write("easylist", "||b.com^\n", &CachedMeta { fetched_at: 43 }).unwrap();
        assert_eq!(cache.read("easylist").unwrap().0, "||b.com^\n");

        cache.set_last_refresh(100).unwrap();
        assert_eq!(cache.last_refresh(), Some(100));
    }

    #[test]
    fn load_prefers_downloaded_copy_and_falls_back_to_embedded() {
        let dir = tempfile::tempdir().unwrap();
        let cache = ListCache::new(dir.path());
        cache.write("easyprivacy", "||t.com^\n", &CachedMeta { fetched_at: 7 }).unwrap();

        let loaded = load_lists(&cache, &["easylist".into(), "easyprivacy".into(), "desconocida".into()]);
        assert_eq!(loaded.len(), 2);
        assert_eq!(loaded[0].id, "easylist");
        assert_eq!(loaded[0].source, ListSource::Embedded);
        assert!(!loaded[0].text.is_empty());
        assert_eq!(loaded[1].id, "easyprivacy");
        assert_eq!(loaded[1].source, ListSource::Downloaded { fetched_at: 7 });
        assert_eq!(loaded[1].text, "||t.com^\n");
    }
}
