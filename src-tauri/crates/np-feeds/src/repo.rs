//! Acceso a SQLite: medios, feeds y artículos (+ FTS5).
use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};

use crate::{
    config::Sources,
    text::{tokenize_lang, Lang},
    Result,
};

#[derive(Debug, Clone, PartialEq)]
pub struct FeedRow {
    pub id: i64,
    pub outlet_id: String,
    pub url: String,
    pub etag: Option<String>,
    pub last_modified: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct NewArticle {
    pub url: String,
    pub outlet_id: Option<String>,
    pub title: String,
    pub summary: String,
    pub language: String,
    pub published_at: i64,
    /// "rss" | "search" | "visited"
    pub origin: String,
    pub topic: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArticleRow {
    pub id: i64,
    pub url: String,
    pub outlet_id: Option<String>,
    pub outlet_name: Option<String>,
    pub title: String,
    pub summary: String,
    pub language: String,
    pub published_at: i64,
    pub origin: String,
    pub topic: Option<String>,
}

pub const ARTICLE_SELECT: &str = "SELECT a.id, a.url, a.outlet_id, o.name, a.title, a.summary, a.language, a.published_at, a.origin, a.topic
     FROM articles a LEFT JOIN outlets o ON o.id = a.outlet_id";

pub fn article_from_row(r: &Row<'_>) -> rusqlite::Result<ArticleRow> {
    Ok(ArticleRow {
        id: r.get(0)?,
        url: r.get(1)?,
        outlet_id: r.get(2)?,
        outlet_name: r.get(3)?,
        title: r.get(4)?,
        summary: r.get(5)?,
        language: r.get(6)?,
        published_at: r.get(7)?,
        origin: r.get(8)?,
        topic: r.get(9)?,
    })
}

/// Vuelca las fuentes en `outlets`/`feeds` (todas las lenguas). Borra feeds que ya no están.
pub fn sync_sources(conn: &Connection, sources: &Sources) -> Result<()> {
    for o in &sources.outlets {
        conn.execute(
            "INSERT INTO outlets(id, name, domain, country, language, kind) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(id) DO UPDATE SET name = excluded.name, domain = excluded.domain,
               country = excluded.country, language = excluded.language, kind = excluded.kind",
            params![o.id, o.name, o.domain, o.country, o.language, o.kind.as_str()],
        )?;
        for f in &o.feeds {
            conn.execute(
                "INSERT INTO feeds(outlet_id, url) VALUES (?1, ?2) ON CONFLICT(url) DO UPDATE SET outlet_id = excluded.outlet_id",
                params![o.id, f],
            )?;
        }
    }
    let wanted: Vec<&String> = sources.outlets.iter().flat_map(|o| o.feeds.iter()).collect();
    let existing: Vec<String> = {
        let mut st = conn.prepare("SELECT url FROM feeds")?;
        let rows = st.query_map([], |r| r.get::<_, String>(0))?;
        rows.collect::<rusqlite::Result<_>>()?
    };
    for url in existing.iter().filter(|u| !wanted.contains(u)) {
        conn.execute("DELETE FROM feeds WHERE url = ?1", [url])?;
    }
    Ok(())
}

pub fn list_feeds(conn: &Connection, language: &str) -> Result<Vec<FeedRow>> {
    let mut st = conn.prepare(
        "SELECT f.id, f.outlet_id, f.url, f.etag, f.last_modified FROM feeds f JOIN outlets o ON o.id = f.outlet_id
         WHERE o.language = ?1 ORDER BY f.id",
    )?;
    let rows = st.query_map([language], |r| {
        Ok(FeedRow { id: r.get(0)?, outlet_id: r.get(1)?, url: r.get(2)?, etag: r.get(3)?, last_modified: r.get(4)? })
    })?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

/// Registra el resultado de una descarga. `etag`/`last_modified` en `None` conservan los anteriores.
pub fn record_fetch(
    conn: &Connection,
    feed_id: i64,
    now: i64,
    status: Option<u16>,
    etag: Option<&str>,
    last_modified: Option<&str>,
    error: Option<&str>,
) -> Result<()> {
    conn.execute(
        "UPDATE feeds SET last_fetched_at = ?2, last_status = ?3, etag = COALESCE(?4, etag),
           last_modified = COALESCE(?5, last_modified), last_error = ?6 WHERE id = ?1",
        params![feed_id, now, status, etag, last_modified, error],
    )?;
    Ok(())
}

/// Inserta artículos nuevos (ignora URLs ya existentes). Devuelve cuántos se insertaron.
pub fn insert_articles(conn: &Connection, items: &[NewArticle], now: i64) -> Result<usize> {
    let mut st = conn.prepare(
        "INSERT OR IGNORE INTO articles(url, outlet_id, title, summary, language, published_at, fetched_at, origin, topic)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
    )?;
    let mut inserted = 0;
    for a in items {
        inserted += st.execute(params![a.url, a.outlet_id, a.title, a.summary, a.language, a.published_at, now, a.origin, a.topic])?;
    }
    Ok(inserted)
}

pub fn article_by_url(conn: &Connection, url: &str) -> Result<Option<ArticleRow>> {
    Ok(conn.query_row(&format!("{ARTICLE_SELECT} WHERE a.url = ?1"), [url], article_from_row).optional()?)
}

/// Búsqueda de texto completo (FTS5, bm25). Deben aparecer todos los términos.
pub fn search_articles(conn: &Connection, query: &str, lang: Lang, limit: usize) -> Result<Vec<ArticleRow>> {
    let terms = tokenize_lang(query, lang);
    if terms.is_empty() {
        return Ok(vec![]);
    }
    let fts = terms.iter().map(|t| format!("\"{t}\"")).collect::<Vec<_>>().join(" ");
    let sql = format!("{ARTICLE_SELECT} JOIN articles_fts f ON f.rowid = a.id WHERE articles_fts MATCH ?1 ORDER BY bm25(articles_fts) LIMIT ?2");
    let mut st = conn.prepare(&sql)?;
    let rows = st.query_map(params![fts, limit as i64], article_from_row)?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::Sources;
    use np_store::Store;

    const SRC: &str = r#"{"version":1,"medios":[
      {"id":"a","nombre":"Diario A","dominio":"a.test","feeds":["https://a.test/rss"],"pais":"ES","idioma":"es","tipo":"medio"},
      {"id":"b","nombre":"Daily B","dominio":"b.test","feeds":["https://b.test/rss","https://b.test/rss2"],"pais":"GB","idioma":"en","tipo":"medio"}
    ]}"#;

    fn store() -> Store {
        let s = Store::open_in_memory().unwrap();
        s.with_tx(|c| sync_sources(c, &Sources::from_json(SRC).unwrap()).map_err(|_| rusqlite::Error::InvalidQuery)).unwrap();
        s
    }

    fn art(url: &str, outlet: &str, title: &str, lang: &str) -> NewArticle {
        NewArticle { url: url.into(), outlet_id: Some(outlet.into()), title: title.into(), summary: String::new(), language: lang.into(), published_at: 100, origin: "rss".into(), topic: None }
    }

    #[test]
    fn syncs_outlets_and_feeds_and_removes_stale_feeds() {
        let s = store();
        assert_eq!(s.with_conn(|c| Ok(list_feeds(c, "en").unwrap().len())).unwrap(), 2);
        assert_eq!(s.with_conn(|c| Ok(list_feeds(c, "es").unwrap().len())).unwrap(), 1);
        let fewer = SRC.replace(r#","https://b.test/rss2""#, "");
        s.with_tx(|c| sync_sources(c, &Sources::from_json(&fewer).unwrap()).map_err(|_| rusqlite::Error::InvalidQuery)).unwrap();
        assert_eq!(s.with_conn(|c| Ok(list_feeds(c, "en").unwrap().len())).unwrap(), 1);
    }

    #[test]
    fn inserts_once_and_searches_with_fts() {
        let s = store();
        let items = vec![art("https://a.test/1", "a", "La subida del salario mínimo", "es"), art("https://a.test/1", "a", "dup", "es"), art("https://b.test/1", "b", "Minimum wage rises", "en")];
        let n = s.with_tx(|c| insert_articles(c, &items, 200).map_err(|_| rusqlite::Error::InvalidQuery)).unwrap();
        assert_eq!(n, 2);
        let found = s.with_conn(|c| Ok(search_articles(c, "salario minimo", crate::text::Lang::Es, 10).unwrap())).unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].outlet_name.as_deref(), Some("Diario A"));
        let by_url = s.with_conn(|c| Ok(article_by_url(c, "https://b.test/1").unwrap())).unwrap().unwrap();
        assert_eq!(by_url.language, "en");
    }

    #[test]
    fn records_fetch_results_keeping_validators() {
        let s = store();
        s.with_conn(|c| {
            let f = &list_feeds(c, "es").unwrap()[0];
            record_fetch(c, f.id, 10, Some(200), Some("\"e1\""), None, None).unwrap();
            record_fetch(c, f.id, 20, Some(304), None, None, None).unwrap();
            let again = &list_feeds(c, "es").unwrap()[0];
            assert_eq!(again.etag.as_deref(), Some("\"e1\""));
            Ok(())
        })
        .unwrap();
    }
}
