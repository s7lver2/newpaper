//! Fuentes añadidas por el usuario (ámbito "fuentes personalizadas" de la sincronización).

use np_store::{ids::stable_id, Store};
use rusqlite::params;
use serde::{Deserialize, Serialize};

use crate::{
    config::{Outlet, OutletKind, Sources},
    FeedsError, Result,
};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomOutlet {
    pub name: String,
    pub domain: String,
    pub feeds: Vec<String>,
    pub language: String,
    pub country: String,
}

fn clean_domain(d: &str) -> String {
    let d = d.trim().to_ascii_lowercase();
    let d = d.trim_start_matches("https://").trim_start_matches("http://");
    d.trim_start_matches("www.").trim_end_matches('/').to_string()
}

pub fn as_sources(list: &[CustomOutlet]) -> Sources {
    Sources {
        version: 1,
        outlets: list
            .iter()
            .map(|c| Outlet {
                id: format!("custom-{}", c.domain.replace('.', "-")),
                name: c.name.clone(),
                domain: c.domain.clone(),
                feeds: c.feeds.clone(),
                country: c.country.clone(),
                language: c.language.clone(),
                kind: OutletKind::Medio,
            })
            .collect(),
    }
}

pub fn add_custom(store: &Store, c: &CustomOutlet) -> Result<()> {
    let clean = CustomOutlet { domain: clean_domain(&c.domain), ..c.clone() };
    as_sources(std::slice::from_ref(&clean)).validate()?;
    let stamp = store.stamp();
    store.with_conn(|conn| {
        conn.execute(
            "INSERT INTO custom_outlets(domain, id, name, feeds_json, language, country, updated_at, deleted) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0)
             ON CONFLICT(domain) DO UPDATE SET name = excluded.name, feeds_json = excluded.feeds_json, language = excluded.language,
               country = excluded.country, updated_at = excluded.updated_at, deleted = 0",
            params![clean.domain, stable_id("custom_outlet", &clean.domain), clean.name, serde_json::to_string(&clean.feeds).unwrap_or_default(), clean.language, clean.country, stamp],
        )
    })?;
    Ok(())
}

pub fn remove_custom(store: &Store, domain: &str) -> Result<()> {
    let stamp = store.stamp();
    store.with_conn(|c| c.execute("UPDATE custom_outlets SET deleted = 1, updated_at = ?2 WHERE domain = ?1", params![clean_domain(domain), stamp]))?;
    Ok(())
}

pub fn list_custom(store: &Store) -> Result<Vec<CustomOutlet>> {
    store
        .with_conn(|c| {
            let mut st = c.prepare("SELECT name, domain, feeds_json, language, country FROM custom_outlets WHERE deleted = 0 ORDER BY name")?;
            let rows = st.query_map([], |r| {
                let feeds: String = r.get(2)?;
                Ok(CustomOutlet { name: r.get(0)?, domain: r.get(1)?, feeds: serde_json::from_str(&feeds).unwrap_or_default(), language: r.get(3)?, country: r.get(4)? })
            })?;
            rows.collect()
        })
        .map_err(FeedsError::from)
}
