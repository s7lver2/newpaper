//! Migraciones versionadas con `PRAGMA user_version`.
//! Ranuras: 1 núcleo, 2 blocked_stats, 3 fuentes, 4 sin conexión, 5 IA, 6 contenido, 7 sincronización.
use rusqlite::Connection;

use crate::StoreError;

#[derive(Debug)]
pub struct Migration {
    pub version: u32,
    pub name: &'static str,
    pub sql: &'static str,
}

/// Cada subproyecto añade su entrada en su ranura; nunca se edita una migración publicada.
pub const MIGRATIONS: &[Migration] = &[Migration {
    version: 1,
    name: "core",
    sql: include_str!("../migrations/0001_core.sql"),
},
    Migration {
        version: 2,
        name: "blocked_stats",
        sql: include_str!("../../np-adblock/sql/blocked_stats.sql"),
    },
    Migration {
        version: 3,
        name: "sources",
        sql: include_str!("../../np-feeds/sql/0003_sources.sql"),
    },
];

pub fn migrate(conn: &mut Connection) -> Result<u32, StoreError> {
    migrate_with(conn, MIGRATIONS)
}

pub(crate) fn migrate_with(conn: &mut Connection, list: &[Migration]) -> Result<u32, StoreError> {
    let current: u32 = conn.pragma_query_value(None, "user_version", |r| r.get(0))?;
    let mut pending: Vec<&Migration> = list.iter().filter(|m| m.version > current).collect();
    pending.sort_by_key(|m| m.version);
    for m in pending {
        let tx = conn.transaction()?;
        tx.execute_batch(m.sql).map_err(|source| StoreError::Migration {
            version: m.version,
            name: m.name,
            source,
        })?;
        tx.pragma_update(None, "user_version", m.version)?;
        tx.commit()?;
        tracing::info!(version = m.version, name = m.name, "migration applied");
    }
    Ok(conn.pragma_query_value(None, "user_version", |r| r.get(0))?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn versions_are_unique_and_contiguous_from_one() {
        let mut v: Vec<u32> = MIGRATIONS.iter().map(|m| m.version).collect();
        v.sort();
        let expected: Vec<u32> = (1..=v.len() as u32).collect();
        assert_eq!(v, expected);
    }

    #[test]
    fn migrate_applies_all_and_is_idempotent() {
        let mut c = Connection::open_in_memory().unwrap();
        let last = MIGRATIONS.iter().map(|m| m.version).max().unwrap();
        assert_eq!(migrate(&mut c).unwrap(), last);
        assert_eq!(migrate(&mut c).unwrap(), last);
        let n: i64 = c
            .query_row("SELECT count(*) FROM sqlite_master WHERE name IN ('settings','history','history_fts','analyses','local_meta')", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 5);
    }

    #[test]
    fn failed_migration_rolls_back_and_reports_version() {
        let mut c = Connection::open_in_memory().unwrap();
        let bad = [Migration { version: 1, name: "bad", sql: "CREATE TABLE a(x); THIS IS NOT SQL;" }];
        let err = migrate_with(&mut c, &bad).unwrap_err();
        assert!(matches!(err, crate::StoreError::Migration { version: 1, .. }));
        let n: i64 = c.query_row("SELECT count(*) FROM sqlite_master WHERE name='a'", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 0);
        let uv: u32 = c.pragma_query_value(None, "user_version", |r| r.get(0)).unwrap();
        assert_eq!(uv, 0);
    }
}
