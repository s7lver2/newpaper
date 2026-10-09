//! "Avisarme cuando haya cobertura" (§6.4): vigila hechos con pocas coberturas.
use np_store::{ids::random_id, Store};
use rusqlite::params;
use serde::Serialize;

use crate::{events::event_outlet_count, FeedsError, Result};

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Watch {
    pub id: String,
    pub article_url: Option<String>,
    pub query: Option<String>,
    pub event_id: Option<i64>,
    pub created_at: i64,
    pub fulfilled_at: Option<i64>,
}

pub fn add_watch(store: &Store, article_url: Option<&str>, query: Option<&str>, event_id: Option<i64>, now: i64) -> Result<String> {
    let id = random_id();
    let stamp = store.stamp();
    store.with_conn(|c| {
        c.execute(
            "INSERT INTO watches(id, article_url, query, event_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, article_url, query, event_id, now, stamp],
        )
    })?;
    Ok(id)
}

pub fn list_watches(store: &Store) -> Result<Vec<Watch>> {
    store
        .with_conn(|c| {
            let mut st = c.prepare("SELECT id, article_url, query, event_id, created_at, fulfilled_at FROM watches WHERE deleted = 0 ORDER BY created_at DESC")?;
            let rows = st.query_map([], |r| Ok(Watch { id: r.get(0)?, article_url: r.get(1)?, query: r.get(2)?, event_id: r.get(3)?, created_at: r.get(4)?, fulfilled_at: r.get(5)? }))?;
            rows.collect()
        })
        .map_err(FeedsError::from)
}

/// Marca y devuelve las vigilancias cuyo hecho ya tiene `min_coverages` medios distintos.
pub fn check_watches(store: &Store, min_coverages: usize, now: i64) -> Result<Vec<Watch>> {
    let pending: Vec<Watch> = list_watches(store)?.into_iter().filter(|w| w.fulfilled_at.is_none() && w.event_id.is_some()).collect();
    let mut done = Vec::new();
    for mut w in pending {
        let ev = w.event_id.expect("filtered");
        let count = store.with_conn(|c| event_outlet_count(c, ev).map_err(crate::ingest::to_sql))?;
        if count >= min_coverages {
            let stamp = store.stamp();
            store.with_conn(|c| c.execute("UPDATE watches SET fulfilled_at = ?2, updated_at = ?3 WHERE id = ?1", params![w.id, now, stamp]))?;
            w.fulfilled_at = Some(now);
            done.push(w);
        }
    }
    Ok(done)
}
