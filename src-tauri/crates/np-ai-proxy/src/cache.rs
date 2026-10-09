//! Caché de análisis por `hash(url + texto)` y etapa, 30 días (tabla `analyses` del subproyecto 1).
use np_store::{ids::stable_id, Store, StoreError};
use rusqlite::{params, OptionalExtension};
use serde::Serialize;

pub const TTL_MS: i64 = 30 * 86_400_000;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedStage {
    pub json: String,
    pub model: Option<String>,
    pub cost: f64,
    pub created_at: i64,
}

pub fn get(store: &Store, url: &str, text_hash: &str, stage: &str, now_ms: i64) -> Result<Option<CachedStage>, StoreError> {
    store.with_conn(|c| {
        c.query_row(
            "SELECT json, model, cost, created_at FROM analyses WHERE url = ?1 AND text_hash = ?2 AND stage = ?3 AND deleted = 0 AND created_at >= ?4",
            params![url, text_hash, stage, now_ms - TTL_MS],
            |r| Ok(CachedStage { json: r.get(0)?, model: r.get(1)?, cost: r.get(2)?, created_at: r.get(3)? }),
        )
        .optional()
    })
}

#[allow(clippy::too_many_arguments)]
pub fn put(store: &Store, url: &str, text_hash: &str, stage: &str, json: &str, model: Option<&str>, cost: f64, now_ms: i64) -> Result<(), StoreError> {
    let id = stable_id("analysis", &format!("{url}|{text_hash}|{stage}"));
    let stamp = store.stamp();
    store.with_conn(|c| {
        c.execute(
            "INSERT INTO analyses(id, url, text_hash, stage, json, model, cost, created_at, updated_at, deleted) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0)
             ON CONFLICT(url, text_hash, stage) DO UPDATE SET json = excluded.json, model = excluded.model, cost = excluded.cost,
               created_at = excluded.created_at, updated_at = excluded.updated_at, deleted = 0",
            params![id, url, text_hash, stage, json, model, cost, now_ms, stamp],
        )
    })?;
    Ok(())
}

pub fn purge(store: &Store, now_ms: i64) -> Result<usize, StoreError> {
    store.with_conn(|c| c.execute("DELETE FROM analyses WHERE created_at < ?1", [now_ms - TTL_MS]))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn caches_per_stage_for_thirty_days_with_stable_ids() {
        let s = Store::open_in_memory().unwrap();
        put(&s, "https://a.es/x", "h1", "score", r#"{"framing":20}"#, Some("anthropic/claude-sonnet-5-5"), 0.01, 1_000).unwrap();
        put(&s, "https://a.es/x", "h1", "score", r#"{"framing":22}"#, None, 0.0, 2_000).unwrap();
        let c = get(&s, "https://a.es/x", "h1", "score", 3_000).unwrap().unwrap();
        assert_eq!(c.json, r#"{"framing":22}"#);
        assert!(get(&s, "https://a.es/x", "h2", "score", 3_000).unwrap().is_none());
        assert!(get(&s, "https://a.es/x", "h1", "score", 2_000 + TTL_MS + 1).unwrap().is_none());
        let id: String = s.with_conn(|c| c.query_row("SELECT id FROM analyses", [], |r| r.get(0))).unwrap();
        assert_eq!(id, np_store::ids::stable_id("analysis", "https://a.es/x|h1|score"));
        assert_eq!(purge(&s, 2_000 + TTL_MS + 1).unwrap(), 1);
    }
}
