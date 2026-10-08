//! Descarga periódica (24 h) de las listas de filtros.

use async_trait::async_trait;
use serde::Serialize;

use crate::lists::{spec, CachedMeta, ListCache};

/// Descarga una URL como texto. En np-app se implementa con la fábrica de clientes de np-net,
/// así que sigue el modo de red (por Tor si está activo).
#[async_trait]
pub trait ListFetcher: Send + Sync {
    async fn fetch(&self, url: &str) -> Result<String, String>;
}

pub const REFRESH_INTERVAL_SECS: i64 = 86_400;

pub fn is_due(last: Option<i64>, now: i64) -> bool {
    last.map_or(true, |l| now - l >= REFRESH_INTERVAL_SECS)
}

/// Rechaza respuestas que no son listas (páginas HTML de error/CAPTCHA, cuerpos casi vacíos).
pub fn validate_list(text: &str) -> Result<(), String> {
    if text.trim_start().starts_with('<') {
        return Err("response looks like HTML, not a filter list".into());
    }
    let rules = text
        .lines()
        .filter(|l| {
            let t = l.trim();
            !t.is_empty() && !t.starts_with('!') && !t.starts_with('[')
        })
        .count();
    if rules < 10 {
        return Err(format!("filter list too short ({rules} rules)"));
    }
    Ok(())
}

#[derive(Debug, Default, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RefreshReport {
    pub updated: Vec<String>,
    pub failed: Vec<(String, String)>,
    pub skipped: bool,
}

pub async fn refresh_lists(
    cache: &ListCache,
    fetcher: &dyn ListFetcher,
    enabled: &[String],
    now: i64,
    force: bool,
) -> RefreshReport {
    if !force && !is_due(cache.last_refresh(), now) {
        return RefreshReport { skipped: true, ..Default::default() };
    }
    let mut report = RefreshReport::default();
    for id in enabled {
        let Some(s) = spec(id) else { continue };
        let result = match fetcher.fetch(s.url).await {
            Ok(text) => validate_list(&text).and_then(|()| {
                cache
                    .write(s.id, &text, &CachedMeta { fetched_at: now })
                    .map_err(|e| e.to_string())
            }),
            Err(e) => Err(e),
        };
        match result {
            Ok(()) => report.updated.push(s.id.to_string()),
            Err(e) => {
                tracing::warn!(list = s.id, error = %e, "filter list update failed");
                report.failed.push((s.id.to_string(), e));
            }
        }
    }
    if !report.updated.is_empty() {
        if let Err(e) = cache.set_last_refresh(now) {
            tracing::warn!(error = %e, "could not store refresh time");
        }
    }
    report
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    struct FakeFetcher(HashMap<&'static str, Result<String, String>>);

    #[async_trait]
    impl ListFetcher for FakeFetcher {
        async fn fetch(&self, url: &str) -> Result<String, String> {
            self.0.get(url).cloned().unwrap_or(Err("404".into()))
        }
    }

    fn good_list() -> String {
        (0..20).map(|i| format!("||ad{i}.example^\n")).collect()
    }

    #[test]
    fn due_after_24h_or_when_never_refreshed() {
        assert!(is_due(None, 1_000));
        assert!(!is_due(Some(1_000), 1_000 + REFRESH_INTERVAL_SECS - 1));
        assert!(is_due(Some(1_000), 1_000 + REFRESH_INTERVAL_SECS));
    }

    #[test]
    fn validation_rejects_html_and_tiny_lists() {
        assert!(validate_list(&good_list()).is_ok());
        assert!(validate_list("<!doctype html><html>").is_err());
        assert!(validate_list("||a^\n||b^\n").is_err());
    }

    #[tokio::test]
    async fn downloads_valid_lists_and_keeps_old_copy_on_failure() {
        let dir = tempfile::tempdir().unwrap();
        let cache = ListCache::new(dir.path());
        cache.write("easyprivacy", "antigua", &CachedMeta { fetched_at: 1 }).unwrap();

        let fetcher = FakeFetcher(HashMap::from([
            ("https://easylist.to/easylist/easylist.txt", Ok(good_list())),
            ("https://easylist.to/easylist/easyprivacy.txt", Ok("<html>captcha</html>".to_string())),
        ]));
        let report = refresh_lists(
            &cache,
            &fetcher,
            &["easylist".into(), "easyprivacy".into()],
            5_000,
            false,
        )
        .await;

        assert_eq!(report.updated, vec!["easylist".to_string()]);
        assert_eq!(report.failed.len(), 1);
        assert_eq!(report.failed[0].0, "easyprivacy");
        assert!(!report.skipped);
        assert_eq!(cache.read("easylist").unwrap().1.fetched_at, 5_000);
        assert_eq!(cache.read("easyprivacy").unwrap().0, "antigua");
        assert_eq!(cache.last_refresh(), Some(5_000));
    }

    #[tokio::test]
    async fn skips_when_not_due_unless_forced() {
        let dir = tempfile::tempdir().unwrap();
        let cache = ListCache::new(dir.path());
        cache.set_last_refresh(10_000).unwrap();
        let fetcher = FakeFetcher(HashMap::from([(
            "https://easylist.to/easylist/easylist.txt",
            Ok(good_list()),
        )]));

        let r = refresh_lists(&cache, &fetcher, &["easylist".into()], 10_100, false).await;
        assert!(r.skipped);
        assert!(r.updated.is_empty());

        let r = refresh_lists(&cache, &fetcher, &["easylist".into()], 10_100, true).await;
        assert!(!r.skipped);
        assert_eq!(r.updated, vec!["easylist".to_string()]);
    }

    #[tokio::test]
    async fn total_failure_does_not_mark_refresh_so_it_retries() {
        let dir = tempfile::tempdir().unwrap();
        let cache = ListCache::new(dir.path());
        let fetcher = FakeFetcher(HashMap::new());
        let r = refresh_lists(&cache, &fetcher, &["easylist".into()], 9_000, false).await;
        assert_eq!(r.failed.len(), 1);
        assert_eq!(cache.last_refresh(), None);
    }
}
