//! Hechos: agrupación de la ventana de 72 h y consultas.
use rusqlite::{params, Connection, OptionalExtension};

use crate::{
    cluster::{assign, ClusterDoc, EventRef},
    repo::{article_from_row, ArticleRow, ARTICLE_SELECT},
    text::{tokenize_lang, Lang},
    Result,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct ClusterReport {
    pub assigned: usize,
    pub new_events: usize,
}

pub fn cluster_window(conn: &Connection, lang: &str, now: i64, window_hours: i64, threshold: f64) -> Result<ClusterReport> {
    let since = now - window_hours * 3600;
    let mut st = conn.prepare(
        "SELECT a.id, a.published_at, a.title, a.summary, ea.event_id FROM articles a
         LEFT JOIN event_articles ea ON ea.article_id = a.id
         WHERE a.language = ?1 AND a.published_at >= ?2 AND a.published_at <= ?3",
    )?;
    let l = Lang::from_code(lang);
    let rows: Vec<(ClusterDoc, String)> = st
        .query_map(params![lang, since, now], |r| {
            let title: String = r.get(2)?;
            let summary: String = r.get(3)?;
            Ok((
                ClusterDoc { article_id: r.get(0)?, published_at: r.get(1)?, tokens: tokenize_lang(&format!("{title} {summary}"), l), event_id: r.get(4)? },
                title,
            ))
        })?
        .collect::<rusqlite::Result<_>>()?;
    let docs: Vec<ClusterDoc> = rows.iter().map(|(d, _)| d.clone()).collect();
    let title_of = |id: i64| rows.iter().find(|(d, _)| d.article_id == id).map(|(_, t)| t.clone()).unwrap_or_default();

    let mut report = ClusterReport::default();
    let mut created: Vec<i64> = Vec::new();
    for a in assign(&docs, threshold) {
        let event_id = match a.event {
            EventRef::Existing(id) => id,
            EventRef::New(i) => {
                if let Some(&id) = created.get(i) {
                    id
                } else {
                    conn.execute(
                        "INSERT INTO events(title, language, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)",
                        params![title_of(a.article_id), lang, now],
                    )?;
                    let id = conn.last_insert_rowid();
                    created.push(id);
                    report.new_events += 1;
                    id
                }
            }
        };
        conn.execute(
            "INSERT OR IGNORE INTO event_articles(event_id, article_id, similarity) VALUES (?1, ?2, ?3)",
            params![event_id, a.article_id, a.similarity],
        )?;
        conn.execute("UPDATE events SET updated_at = ?2 WHERE id = ?1", params![event_id, now])?;
        report.assigned += 1;
    }
    Ok(report)
}

pub fn event_of_article(conn: &Connection, article_id: i64) -> Result<Option<i64>> {
    Ok(conn
        .query_row("SELECT event_id FROM event_articles WHERE article_id = ?1", [article_id], |r| r.get(0))
        .optional()?)
}

pub fn event_articles(conn: &Connection, event_id: i64) -> Result<Vec<ArticleRow>> {
    let mut st = conn.prepare(&format!(
        "{ARTICLE_SELECT} JOIN event_articles ea ON ea.article_id = a.id WHERE ea.event_id = ?1 ORDER BY a.published_at"
    ))?;
    let rows = st.query_map([event_id], article_from_row)?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

pub fn event_outlet_count(conn: &Connection, event_id: i64) -> Result<usize> {
    let n: i64 = conn.query_row(
        "SELECT count(DISTINCT a.outlet_id) FROM event_articles ea JOIN articles a ON a.id = ea.article_id WHERE ea.event_id = ?1",
        [event_id],
        |r| r.get(0),
    )?;
    Ok(n as usize)
}
