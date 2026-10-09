//! Consultas para la nueva pestaña (briefing, temas, búsqueda de hechos) y temas seguidos.
use np_store::{ids::stable_id, Store};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

use crate::{
    coverage::{bucket_of, coverage_for_event, Bucket, Coverage},
    settings::FeedsSettings,
    stats::OutletLean,
    text::{tokenize_lang, Lang},
    topics::Topics,
    FeedsError, Result,
};

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventCard {
    pub event_id: i64,
    pub title: String,
    pub outlet_count: usize,
    /// Medios por franja: [izquierda, centro, derecha] (los de posición desconocida no cuentan).
    pub lean_mix: [usize; 3],
    pub latest_at: i64,
    pub topic: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventDetail {
    pub card: EventCard,
    pub articles: Vec<Coverage>,
}

fn card(conn: &Connection, event_id: i64, leans: &[OutletLean], s: &FeedsSettings) -> Result<Option<EventCard>> {
    let head: Option<(String, i64)> = conn
        .query_row("SELECT title, updated_at FROM events WHERE id = ?1", [event_id], |r| Ok((r.get(0)?, r.get(1)?)))
        .optional()?;
    let Some((title, _)) = head else { return Ok(None) };
    let mut st = conn.prepare(
        "SELECT DISTINCT a.outlet_id, max(a.published_at) OVER (), a.topic FROM event_articles ea JOIN articles a ON a.id = ea.article_id
         WHERE ea.event_id = ?1 AND a.outlet_id IS NOT NULL",
    )?;
    let rows: Vec<(String, i64, Option<String>)> = st.query_map([event_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?.collect::<rusqlite::Result<_>>()?;
    let mut outlets: Vec<&String> = rows.iter().map(|(o, _, _)| o).collect();
    outlets.sort();
    outlets.dedup();
    let mut mix = [0usize; 3];
    for o in &outlets {
        let lean = leans.iter().find(|l| &l.outlet_id == *o).and_then(|l| l.effective);
        match bucket_of(lean, s) {
            Bucket::Left => mix[0] += 1,
            Bucket::Center => mix[1] += 1,
            Bucket::Right => mix[2] += 1,
            Bucket::Unknown => {}
        }
    }
    let topic = rows.iter().find_map(|(_, _, t)| t.clone());
    let latest = rows.iter().map(|(_, at, _)| *at).max().unwrap_or(0);
    Ok(Some(EventCard { event_id, title, outlet_count: outlets.len(), lean_mix: mix, latest_at: latest, topic }))
}

pub fn briefing(conn: &Connection, lang: &str, now: i64, limit: usize, leans: &[OutletLean], s: &FeedsSettings) -> Result<Vec<EventCard>> {
    let mut st = conn.prepare("SELECT id FROM events WHERE language = ?1 AND updated_at >= ?2")?;
    let ids: Vec<i64> = st.query_map(params![lang, now - 24 * 3600], |r| r.get(0))?.collect::<rusqlite::Result<_>>()?;
    let mut cards: Vec<EventCard> = ids.into_iter().filter_map(|id| card(conn, id, leans, s).transpose()).collect::<Result<_>>()?;
    cards.sort_by(|a, b| b.outlet_count.cmp(&a.outlet_count).then(b.latest_at.cmp(&a.latest_at)));
    cards.truncate(limit);
    Ok(cards)
}

pub fn events_search(conn: &Connection, query: &str, lang: Lang, limit: usize) -> Result<Vec<EventCard>> {
    let terms = tokenize_lang(query, lang);
    if terms.is_empty() {
        return Ok(vec![]);
    }
    let fts = terms.iter().map(|t| format!("\"{t}\"")).collect::<Vec<_>>().join(" ");
    let mut st = conn.prepare(
        "SELECT DISTINCT ea.event_id FROM articles_fts f JOIN event_articles ea ON ea.article_id = f.rowid
         WHERE articles_fts MATCH ?1 ORDER BY bm25(articles_fts) LIMIT ?2",
    )?;
    let ids: Vec<i64> = st.query_map(params![fts, limit as i64], |r| r.get(0))?.collect::<rusqlite::Result<_>>()?;
    let s = FeedsSettings::default();
    ids.into_iter().filter_map(|id| card(conn, id, &[], &s).transpose()).collect()
}

pub fn event_detail(conn: &Connection, event_id: i64, leans: &[OutletLean], s: &FeedsSettings) -> Result<Option<EventDetail>> {
    let Some(c) = card(conn, event_id, leans, s)? else { return Ok(None) };
    let all = FeedsSettings { coverage_per_bucket: usize::MAX, ..s.clone() };
    let (articles, _) = coverage_for_event(conn, event_id, None, leans, &all)?;
    Ok(Some(EventDetail { card: c, articles }))
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopicState {
    pub id: String,
    pub name: String,
    pub following: bool,
    /// Artículos del tema en las últimas 24 h.
    pub new_count: usize,
}

pub fn set_following(store: &Store, topic_id: &str, following: bool) -> Result<()> {
    let stamp = store.stamp();
    store.with_conn(|c| {
        c.execute(
            "INSERT INTO topics(topic_id, id, following, updated_at, deleted) VALUES (?1, ?2, ?3, ?4, 0)
             ON CONFLICT(topic_id) DO UPDATE SET following = excluded.following, updated_at = excluded.updated_at, deleted = 0",
            params![topic_id, stable_id("topic", topic_id), following, stamp],
        )
    })?;
    Ok(())
}

pub fn followed_topics(store: &Store) -> Result<Vec<String>> {
    store
        .with_conn(|c| {
            let mut st = c.prepare("SELECT topic_id FROM topics WHERE following = 1 AND deleted = 0 ORDER BY topic_id")?;
            let rows = st.query_map([], |r| r.get(0))?;
            rows.collect()
        })
        .map_err(FeedsError::from)
}

pub fn topics_state(store: &Store, topics: &Topics, now: i64) -> Result<Vec<TopicState>> {
    let followed = followed_topics(store)?;
    topics
        .topics
        .iter()
        .map(|t| {
            let n: i64 = store.with_conn(|c| c.query_row("SELECT count(*) FROM articles WHERE topic = ?1 AND published_at >= ?2", params![t.id, now - 24 * 3600], |r| r.get(0)))?;
            Ok(TopicState { id: t.id.clone(), name: t.name.clone(), following: followed.contains(&t.id), new_count: n as usize })
        })
        .collect()
}
