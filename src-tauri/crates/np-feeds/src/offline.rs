//! Ediciones del día sin conexión (§18): construcción, consulta, límites y búsqueda local.
use np_store::{ids::random_id, Store};
use rusqlite::params;
use serde::{Deserialize, Serialize};

use crate::{
    text::{tokenize_lang, Lang},
    FeedsError, Result,
};

pub const SETTINGS_KEY: &str = "offline.settings";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct OfflineSettings {
    pub enabled: bool,
    /// "HH:MM" en hora local.
    pub time: String,
    pub wifi_only: bool,
    pub ac_only: bool,
    pub articles: usize,
    pub max_mb: u64,
    pub expiry_days: i64,
}

impl Default for OfflineSettings {
    fn default() -> Self {
        Self { enabled: true, time: "07:00".into(), wifi_only: false, ac_only: false, articles: 20, max_mb: 500, expiry_days: 7 }
    }
}

impl OfflineSettings {
    pub fn load(store: &Store) -> Result<Self> {
        Ok(store.get_setting::<OfflineSettings>(SETTINGS_KEY)?.unwrap_or_default())
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Edition {
    pub id: String,
    pub date: String,
    pub created_at: i64,
    pub bytes: i64,
    pub status: String,
    pub article_count: usize,
    pub summary_json: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OfflineHit {
    /// "saved" | "edition"
    pub kind: String,
    /// URL (guardado) o "<editionId> <url>" (edición).
    pub reference: String,
    pub title: String,
}

pub fn should_build(today: &str, now_hhmm: &str, s: &OfflineSettings, last_built: Option<&str>, wifi: bool, ac: bool) -> bool {
    s.enabled && now_hhmm >= s.time.as_str() && last_built != Some(today) && (!s.wifi_only || wifi) && (!s.ac_only || ac)
}

pub fn begin(store: &Store, date: &str, now: i64) -> Result<String> {
    let id = random_id();
    store.with_conn(|c| c.execute("INSERT INTO offline_editions(id, date, created_at) VALUES (?1, ?2, ?3)", params![id, date, now]))?;
    Ok(id)
}

pub fn add_article(store: &Store, edition_id: &str, url: &str, title: &str, outlet: Option<&str>, article_json: &str, analysis_json: Option<&str>) -> Result<()> {
    let body = serde_json::from_str::<serde_json::Value>(article_json).ok().and_then(|v| v.get("text").and_then(|t| t.as_str()).map(str::to_string)).unwrap_or_default();
    store.with_tx(|tx| {
        tx.execute(
            "INSERT OR REPLACE INTO offline_articles(edition_id, url, title, outlet, article_json, analysis_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![edition_id, url, title, outlet, article_json, analysis_json],
        )?;
        tx.execute("INSERT INTO offline_fts(title, body, kind, reference) VALUES (?1, ?2, 'edition', ?3)", params![title, body, format!("{edition_id} {url}")])?;
        tx.execute("UPDATE offline_editions SET bytes = bytes + ?2 WHERE id = ?1", params![edition_id, article_json.len() as i64])?;
        Ok(())
    })?;
    Ok(())
}

pub fn add_bytes(store: &Store, edition_id: &str, n: i64) -> Result<()> {
    store.with_conn(|c| c.execute("UPDATE offline_editions SET bytes = bytes + ?2 WHERE id = ?1", params![edition_id, n]))?;
    Ok(())
}

pub fn finish(store: &Store, edition_id: &str, summary_json: &str) -> Result<()> {
    store.with_conn(|c| c.execute("UPDATE offline_editions SET status = 'ready', summary_json = ?2 WHERE id = ?1", params![edition_id, summary_json]))?;
    Ok(())
}

pub fn editions(store: &Store) -> Result<Vec<Edition>> {
    store
        .with_conn(|c| {
            let mut st = c.prepare(
                "SELECT e.id, e.date, e.created_at, e.bytes, e.status, (SELECT count(*) FROM offline_articles a WHERE a.edition_id = e.id), e.summary_json
                 FROM offline_editions e ORDER BY e.created_at DESC",
            )?;
            let rows = st.query_map([], |r| {
                Ok(Edition { id: r.get(0)?, date: r.get(1)?, created_at: r.get(2)?, bytes: r.get(3)?, status: r.get(4)?, article_count: r.get::<_, i64>(5)? as usize, summary_json: r.get(6)? })
            })?;
            rows.collect()
        })
        .map_err(FeedsError::from)
}

/// (url, title, outlet, article_json, analysis_json)
pub fn edition_articles(store: &Store, id: &str) -> Result<Vec<(String, String, Option<String>, String, Option<String>)>> {
    store
        .with_conn(|c| {
            let mut st = c.prepare("SELECT url, title, outlet, article_json, analysis_json FROM offline_articles WHERE edition_id = ?1 ORDER BY rowid")?;
            let rows = st.query_map([id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)))?;
            rows.collect()
        })
        .map_err(FeedsError::from)
}

fn delete_edition(store: &Store, id: &str) -> Result<()> {
    store.with_tx(|tx| {
        tx.execute("DELETE FROM offline_fts WHERE kind = 'edition' AND reference LIKE ?1", [format!("{id} %")])?;
        tx.execute("DELETE FROM offline_articles WHERE edition_id = ?1", [id])?;
        tx.execute("DELETE FROM offline_editions WHERE id = ?1", [id])?;
        Ok(())
    })?;
    Ok(())
}

/// Borra ediciones caducadas y, si se supera la cuota, las más antiguas. Devuelve los ids borrados
/// (np-app borra además sus carpetas de imágenes).
pub fn cleanup(store: &Store, now: i64, max_bytes: i64, expiry_days: i64) -> Result<Vec<String>> {
    let mut eds = editions(store)?;
    eds.sort_by_key(|e| e.created_at);
    let mut removed = Vec::new();
    let mut total: i64 = eds.iter().map(|e| e.bytes).sum();
    for e in &eds {
        let expired = now - e.created_at > expiry_days * 86_400;
        let over = total > max_bytes && eds.last().map(|l| l.id != e.id).unwrap_or(false);
        if expired || over {
            delete_edition(store, &e.id)?;
            total -= e.bytes;
            removed.push(e.id.clone());
        }
    }
    Ok(removed)
}

pub fn search(store: &Store, query: &str, lang: Lang) -> Result<Vec<OfflineHit>> {
    let terms = tokenize_lang(query, lang);
    if terms.is_empty() {
        return Ok(vec![]);
    }
    let fts = terms.iter().map(|t| format!("\"{t}\"*")).collect::<Vec<_>>().join(" ");
    store
        .with_conn(|c| {
            let mut st = c.prepare("SELECT kind, reference, title FROM offline_fts WHERE offline_fts MATCH ?1 ORDER BY bm25(offline_fts) LIMIT 50")?;
            let rows = st.query_map([fts], |r| Ok(OfflineHit { kind: r.get(0)?, reference: r.get(1)?, title: r.get(2)? }))?;
            rows.collect()
        })
        .map_err(FeedsError::from)
}


#[cfg(test)]
mod tests {
    use super::*;
    use np_store::Store;

    const DAY: i64 = 86_400;

    #[test]
    fn builds_an_edition_and_lists_it() {
        let s = Store::open_in_memory().unwrap();
        let id = begin(&s, "2026-10-06", 100).unwrap();
        add_article(&s, &id, "https://a.test/1", "La subida del SMI", Some("A"), r#"{"text":"salario"}"#, Some(r#"{"neutrality":44}"#)).unwrap();
        add_bytes(&s, &id, 2048).unwrap();
        finish(&s, &id, r#"{"events":[]}"#).unwrap();
        let eds = editions(&s).unwrap();
        assert_eq!(eds.len(), 1);
        assert_eq!((eds[0].status.as_str(), eds[0].article_count, eds[0].bytes), ("ready", 1, 2048 + r#"{"text":"salario"}"#.len() as i64));
        assert_eq!(edition_articles(&s, &id).unwrap()[0].4.as_deref(), Some(r#"{"neutrality":44}"#));
        assert_eq!(search(&s, "salario", crate::text::Lang::Es).unwrap()[0].kind, "edition");
    }

    #[test]
    fn cleanup_removes_expired_then_oldest_over_quota() {
        let s = Store::open_in_memory().unwrap();
        let old = begin(&s, "2026-09-20", 0).unwrap();
        let a = begin(&s, "2026-10-05", 15 * DAY).unwrap();
        let b = begin(&s, "2026-10-06", 16 * DAY).unwrap();
        for (id, bytes) in [(&old, 10), (&a, 300), (&b, 300)] {
            add_bytes(&s, id, bytes).unwrap();
            finish(&s, id, "{}").unwrap();
        }
        let removed = cleanup(&s, 16 * DAY, 400, 7).unwrap();
        assert_eq!(removed, vec![old.clone(), a.clone()]);
        assert_eq!(editions(&s).unwrap().len(), 1);
    }

    #[test]
    fn decides_when_to_build_the_daily_edition() {
        let st = OfflineSettings::default();
        assert!(!should_build("2026-10-06", "06:59", &st, None, true, true));
        assert!(should_build("2026-10-06", "07:00", &st, None, false, false));
        assert!(!should_build("2026-10-06", "09:00", &st, Some("2026-10-06"), true, true));
        let wifi = OfflineSettings { wifi_only: true, ac_only: true, ..st.clone() };
        assert!(!should_build("2026-10-06", "08:00", &wifi, None, false, true));
        assert!(!should_build("2026-10-06", "08:00", &wifi, None, true, false));
        assert!(should_build("2026-10-06", "08:00", &wifi, None, true, true));
        assert!(!should_build("2026-10-06", "08:00", &OfflineSettings { enabled: false, ..st }, None, true, true));
    }
}
