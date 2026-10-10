//! Historial local de contenido aplicado o revertido.

use np_store::Store;
use rusqlite::params;
use serde::{Deserialize, Serialize};

use crate::{Result, UpdateError};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentUpdate {
    pub manifest_version: u32,
    pub applied_at: i64,
    pub action: String,
    pub resources: Vec<String>,
}

pub fn record(store: &Store, u: &ContentUpdate) -> Result<()> {
    let resources = serde_json::to_string(&u.resources)?;
    store
        .with_conn(|c| c.execute("INSERT INTO content_updates(manifest_version, applied_at, action, resources) VALUES (?1, ?2, ?3, ?4)", params![u.manifest_version, u.applied_at, u.action, resources]))
        .map_err(|e| UpdateError::Manifest(e.to_string()))?;
    Ok(())
}

pub fn history(store: &Store, limit: u32) -> Result<Vec<ContentUpdate>> {
    store
        .with_conn(|c| {
            let mut st = c.prepare("SELECT manifest_version, applied_at, action, resources FROM content_updates ORDER BY applied_at DESC, id DESC LIMIT ?1")?;
            let rows = st.query_map([limit], |r| {
                let res: String = r.get(3)?;
                Ok(ContentUpdate { manifest_version: r.get(0)?, applied_at: r.get(1)?, action: r.get(2)?, resources: serde_json::from_str(&res).unwrap_or_default() })
            })?;
            rows.collect::<rusqlite::Result<Vec<_>>>()
        })
        .map_err(|e| UpdateError::Manifest(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migration_6_creates_the_table_and_history_is_newest_first() {
        let dir = tempfile::tempdir().unwrap();
        let store = np_store::Store::open(&dir.path().join("np.db")).unwrap();
        let v: i64 = store.with_conn(|c| c.query_row("PRAGMA user_version", [], |r| r.get(0))).unwrap();
        assert!(v >= 6);
        record(&store, &ContentUpdate { manifest_version: 3, applied_at: 10, action: "apply".into(), resources: vec!["sources-es.json".into()] }).unwrap();
        record(&store, &ContentUpdate { manifest_version: 3, applied_at: 20, action: "revert".into(), resources: vec![] }).unwrap();
        let h = history(&store, 10).unwrap();
        assert_eq!(h.iter().map(|x| x.action.as_str()).collect::<Vec<_>>(), vec!["revert", "apply"]);
        assert_eq!(h[1].resources, vec!["sources-es.json".to_string()]);
        let bad = store.with_conn(|c| c.execute("INSERT INTO content_updates(manifest_version, applied_at, action, resources) VALUES (1, 1, 'drop', '[]')", []));
        assert!(bad.is_err());
    }
}
