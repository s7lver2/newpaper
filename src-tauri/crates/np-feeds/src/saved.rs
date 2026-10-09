//! "Leer más tarde" (§18): artículos guardados en modo lector, sincronizables.
use np_store::{ids::stable_id, Store};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::{FeedsError, Result};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedArticle {
    pub url: String,
    pub title: String,
    pub outlet: Option<String>,
    /// `Article` del subproyecto 1 serializado (HTML ya extraído).
    pub article_json: String,
    pub saved_at: i64,
}

fn body_text(article_json: &str) -> String {
    serde_json::from_str::<serde_json::Value>(article_json).ok().and_then(|v| v.get("text").and_then(|t| t.as_str()).map(str::to_string)).unwrap_or_default()
}

pub fn save(store: &Store, a: &SavedArticle) -> Result<()> {
    let stamp = store.stamp();
    store.with_tx(|tx| {
        tx.execute(
            "INSERT INTO saved_articles(url, id, title, outlet, article_json, saved_at, updated_at, deleted) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0)
             ON CONFLICT(url) DO UPDATE SET title = excluded.title, outlet = excluded.outlet, article_json = excluded.article_json,
               saved_at = excluded.saved_at, updated_at = excluded.updated_at, deleted = 0",
            params![a.url, stable_id("saved", &a.url), a.title, a.outlet, a.article_json, a.saved_at, stamp],
        )?;
        tx.execute("DELETE FROM offline_fts WHERE kind = 'saved' AND reference = ?1", [&a.url])?;
        tx.execute("INSERT INTO offline_fts(title, body, kind, reference) VALUES (?1, ?2, 'saved', ?3)", params![a.title, body_text(&a.article_json), a.url])?;
        Ok(())
    })?;
    Ok(())
}

pub fn remove(store: &Store, url: &str) -> Result<()> {
    let stamp = store.stamp();
    store.with_tx(|tx| {
        tx.execute("UPDATE saved_articles SET deleted = 1, article_json = '{}', updated_at = ?2 WHERE url = ?1", params![url, stamp])?;
        tx.execute("DELETE FROM offline_fts WHERE kind = 'saved' AND reference = ?1", [url])?;
        Ok(())
    })?;
    Ok(())
}

fn row(r: &rusqlite::Row<'_>) -> rusqlite::Result<SavedArticle> {
    Ok(SavedArticle { url: r.get(0)?, title: r.get(1)?, outlet: r.get(2)?, article_json: r.get(3)?, saved_at: r.get(4)? })
}

pub fn list(store: &Store) -> Result<Vec<SavedArticle>> {
    store
        .with_conn(|c| {
            let mut st = c.prepare("SELECT url, title, outlet, article_json, saved_at FROM saved_articles WHERE deleted = 0 ORDER BY saved_at DESC")?;
            let rows = st.query_map([], row)?;
            rows.collect()
        })
        .map_err(FeedsError::from)
}

pub fn get(store: &Store, url: &str) -> Result<Option<SavedArticle>> {
    store
        .with_conn(|c| c.query_row("SELECT url, title, outlet, article_json, saved_at FROM saved_articles WHERE url = ?1 AND deleted = 0", [url], row).optional())
        .map_err(FeedsError::from)
}


#[cfg(test)]
mod tests {
    use super::*;
    use np_store::Store;

    fn a(url: &str) -> SavedArticle {
        SavedArticle { url: url.into(), title: "Titular sobre vivienda".into(), outlet: Some("A".into()), article_json: r#"{"text":"El alquiler sube"}"#.into(), saved_at: 10 }
    }

    #[test]
    fn save_list_get_remove_with_local_search() {
        let s = Store::open_in_memory().unwrap();
        save(&s, &a("https://a.test/1")).unwrap();
        save(&s, &a("https://a.test/1")).unwrap();
        assert_eq!(list(&s).unwrap().len(), 1);
        assert!(get(&s, "https://a.test/1").unwrap().is_some());
        let hits = crate::offline::search(&s, "alquiler", crate::text::Lang::Es).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].kind, "saved");
        remove(&s, "https://a.test/1").unwrap();
        assert!(list(&s).unwrap().is_empty());
        assert!(crate::offline::search(&s, "alquiler", crate::text::Lang::Es).unwrap().is_empty());
        let row: (String, i64) = s.with_conn(|c| c.query_row("SELECT id, deleted FROM saved_articles", [], |r| Ok((r.get(0)?, r.get(1)?)))).unwrap();
        assert_eq!(row, (np_store::ids::stable_id("saved", "https://a.test/1"), 1));
    }
}
