//! Filas sincronizables: diario, exportación y fusión "el último que escribe gana" (§15).
use std::{collections::HashSet, str::FromStr};

use np_store::{Hlc, Store};
use rusqlite::{types::ValueRef, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::{Result, SyncError};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Scope {
    Settings,
    History,
    Saved,
    Analyses,
    Topics,
    Sources,
    Keys,
}

impl Scope {
    /// Por defecto todo menos las claves de API (no se activan sin pedirlo).
    pub const DEFAULT: &'static [Scope] = &[Scope::Settings, Scope::History, Scope::Saved, Scope::Analyses, Scope::Topics, Scope::Sources];
}

pub const TABLES: &[(&str, Scope)] = &[
    ("settings", Scope::Settings),
    ("history", Scope::History),
    ("saved_articles", Scope::Saved),
    ("analyses", Scope::Analyses),
    ("topics", Scope::Topics),
    ("watches", Scope::Topics),
    ("custom_outlets", Scope::Sources),
    ("outlet_overrides", Scope::Sources),
];

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Row {
    pub seq: i64,
    pub table: String,
    pub data: Map<String, Value>,
}

fn scope_of(table: &str) -> Option<Scope> {
    TABLES.iter().find(|(t, _)| *t == table).map(|(_, s)| *s)
}

fn is_device_setting(table: &str, data: &Map<String, Value>) -> bool {
    table == "settings" && data.get("key").and_then(|k| k.as_str()).is_some_and(|k| k.starts_with("device."))
}

fn to_json(v: ValueRef<'_>) -> Value {
    match v {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(i) => Value::from(i),
        ValueRef::Real(f) => Value::from(f),
        ValueRef::Text(t) => Value::from(String::from_utf8_lossy(t).to_string()),
        ValueRef::Blob(_) => Value::Null, // ninguna tabla sincronizable guarda blobs
    }
}

fn read_row(c: &rusqlite::Connection, table: &str, id: &str) -> rusqlite::Result<Option<Map<String, Value>>> {
    let mut st = c.prepare(&format!("SELECT * FROM {table} WHERE id = ?1"))?;
    let names: Vec<String> = st.column_names().iter().map(|s| s.to_string()).collect();
    st.query_row([id], |r| {
        let mut m = Map::new();
        for (i, n) in names.iter().enumerate() {
            m.insert(n.clone(), to_json(r.get_ref(i)?));
        }
        Ok(m)
    })
    .optional()
}

/// Filas cambiadas después de `after_seq` en orden de diario, con los ámbitos pedidos.
/// Devuelve también la última secuencia leída (aunque la fila se filtrara).
pub fn changes_after(store: &Store, scopes: &[Scope], after_seq: i64, limit: usize) -> Result<(Vec<Row>, i64)> {
    let wanted: HashSet<Scope> = scopes.iter().copied().collect();
    Ok(store.with_conn(|c| {
        let mut st = c.prepare("SELECT seq, tbl, row_id FROM sync_journal WHERE seq > ?1 ORDER BY seq LIMIT ?2")?;
        let entries: Vec<(i64, String, String)> = st.query_map(rusqlite::params![after_seq, limit as i64], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?.collect::<rusqlite::Result<_>>()?;
        let mut last = after_seq;
        let mut out = Vec::new();
        for (seq, tbl, id) in entries {
            last = seq;
            if !scope_of(&tbl).is_some_and(|s| wanted.contains(&s)) {
                continue;
            }
            if let Some(data) = read_row(c, &tbl, &id)? {
                if !is_device_setting(&tbl, &data) {
                    out.push(Row { seq, table: tbl, data });
                }
            }
        }
        Ok((out, last))
    })?)
}

pub fn export_all(store: &Store, scopes: &[Scope]) -> Result<Vec<Row>> {
    let mut all = Vec::new();
    let mut after = 0;
    loop {
        let (rows, last) = changes_after(store, scopes, after, 1000)?;
        if last == after {
            break;
        }
        all.extend(rows);
        after = last;
    }
    Ok(all)
}

fn columns(c: &rusqlite::Connection, table: &str) -> rusqlite::Result<HashSet<String>> {
    let mut st = c.prepare(&format!("PRAGMA table_info({table})"))?;
    let cols = st.query_map([], |r| r.get::<_, String>(1))?.collect::<rusqlite::Result<HashSet<_>>>()?;
    Ok(cols)
}

fn to_sql(v: &Value) -> rusqlite::types::Value {
    match v {
        Value::Null => rusqlite::types::Value::Null,
        Value::Bool(b) => rusqlite::types::Value::Integer(*b as i64),
        Value::Number(n) => n.as_i64().map(rusqlite::types::Value::Integer).unwrap_or_else(|| rusqlite::types::Value::Real(n.as_f64().unwrap_or(0.0))),
        Value::String(s) => rusqlite::types::Value::Text(s.clone()),
        other => rusqlite::types::Value::Text(other.to_string()),
    }
}

/// Aplica filas remotas: gana el `updated_at` (HLC) mayor; los empates no cambian nada.
///
/// Las filas existentes se actualizan con `UPDATE` (los disparadores de FTS de la hemeroteca siguen
/// funcionando). Una fila nueva que choca con otra clave natural (p. ej. el mismo dominio en dos equipos) se
/// omite en lugar de bloquear toda la sincronización.
pub fn apply(store: &Store, rows: &[Row], scopes: &[Scope]) -> Result<usize> {
    let wanted: HashSet<Scope> = scopes.iter().copied().collect();
    for r in rows {
        if let Some(h) = r.data.get("updated_at").and_then(|v| v.as_str()).and_then(|s| Hlc::from_str(s).ok()) {
            store.clock().observe(&h);
        }
    }
    let applied = store.with_tx(|tx| {
        let mut n = 0;
        for r in rows {
            let Some(scope) = scope_of(&r.table) else { continue };
            if !wanted.contains(&scope) || is_device_setting(&r.table, &r.data) {
                continue;
            }
            let (Some(id), Some(remote)) = (r.data.get("id").and_then(|v| v.as_str()), r.data.get("updated_at").and_then(|v| v.as_str())) else { continue };
            let cols = columns(tx, &r.table)?;
            if r.data.keys().any(|k| !cols.contains(k)) {
                return Err(rusqlite::Error::InvalidColumnName("unknown column in remote row".into()));
            }
            let local: Option<String> = tx.query_row(&format!("SELECT updated_at FROM {} WHERE id = ?1", r.table), [id], |x| x.get(0)).optional()?;
            if local.as_deref().is_some_and(|l| l >= remote) {
                continue;
            }
            let names: Vec<&String> = r.data.keys().collect();
            let mut values: Vec<rusqlite::types::Value> = names.iter().map(|n| to_sql(&r.data[*n])).collect();
            let changed = if local.is_some() {
                let sets = names.iter().enumerate().map(|(i, n)| format!("\"{n}\" = ?{}", i + 1)).collect::<Vec<_>>().join(", ");
                values.push(rusqlite::types::Value::Text(id.to_string()));
                let sql = format!("UPDATE OR IGNORE {} SET {sets} WHERE id = ?{}", r.table, names.len() + 1);
                tx.execute(&sql, rusqlite::params_from_iter(values))?
            } else {
                let cols_sql = names.iter().map(|n| format!("\"{n}\"")).collect::<Vec<_>>().join(", ");
                let placeholders = (1..=names.len()).map(|i| format!("?{i}")).collect::<Vec<_>>().join(", ");
                let sql = format!("INSERT OR IGNORE INTO {} ({cols_sql}) VALUES ({placeholders})", r.table);
                tx.execute(&sql, rusqlite::params_from_iter(values))?
            };
            n += changed;
        }
        Ok(n)
    });
    applied.map_err(|e| SyncError::Store(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use np_store::Store;

    fn all(s: &Store) -> Vec<Row> {
        changes_after(s, Scope::DEFAULT, 0, 10_000).unwrap().0
    }

    #[test]
    fn last_writer_wins_with_tombstones_and_without_device_keys() {
        let (a, b) = (Store::open_in_memory().unwrap(), Store::open_in_memory().unwrap());
        a.set_setting("general.locale", &"en").unwrap();
        a.set_setting("device.updates.channel", &"beta").unwrap();
        let rows = all(&a);
        assert!(rows.iter().all(|r| r.data.get("key").and_then(|k| k.as_str()).map_or(true, |k| !k.starts_with("device."))));
        assert!(apply(&b, &rows, Scope::DEFAULT).unwrap() >= 1);
        assert_eq!(b.get_setting::<String>("general.locale").unwrap().as_deref(), Some("en"));
        assert_eq!(b.get_setting::<String>("device.updates.channel").unwrap(), None);

        // B escribe después (su reloj ya observó el de A): gana B y reaplicar lo viejo no cambia nada.
        b.set_setting("general.locale", &"de").unwrap();
        assert_eq!(apply(&b, &rows, Scope::DEFAULT).unwrap(), 0);
        assert_eq!(b.get_setting::<String>("general.locale").unwrap().as_deref(), Some("de"));
        apply(&a, &all(&b), Scope::DEFAULT).unwrap();
        assert_eq!(a.get_setting::<String>("general.locale").unwrap().as_deref(), Some("de"));

        // Lápida.
        a.delete_setting("general.locale").unwrap();
        apply(&b, &all(&a), Scope::DEFAULT).unwrap();
        assert_eq!(b.get_setting::<String>("general.locale").unwrap(), None);
    }

    #[test]
    fn journal_forwards_rows_from_a_third_device_even_with_older_clocks() {
        let (a, b, c) = (Store::open_in_memory().unwrap(), Store::open_in_memory().unwrap(), Store::open_in_memory().unwrap());
        c.set_setting("reader.autoOpen", &false).unwrap(); // C escribe primero (HLC antiguo)
        a.set_setting("general.locale", &"en").unwrap();
        apply(&b, &all(&a), Scope::DEFAULT).unwrap();
        let (_, a_mark) = changes_after(&b, Scope::DEFAULT, 0, 10_000).unwrap(); // A ya recibió todo lo de B hasta aquí
        apply(&b, &all(&c), Scope::DEFAULT).unwrap(); // llega lo de C, más antiguo que lo de A
        let (rows, _) = changes_after(&b, Scope::DEFAULT, a_mark, 10_000).unwrap();
        apply(&a, &rows, Scope::DEFAULT).unwrap();
        assert_eq!(a.get_setting::<bool>("reader.autoOpen").unwrap(), Some(false));
    }

    #[test]
    fn scopes_and_malicious_rows_are_filtered() {
        let (a, b) = (Store::open_in_memory().unwrap(), Store::open_in_memory().unwrap());
        a.set_setting("general.locale", &"en").unwrap();
        assert_eq!(apply(&b, &all(&a), &[Scope::History]).unwrap(), 0);
        let mut evil = all(&a)[0].clone();
        evil.table = "local_meta".into();
        assert_eq!(apply(&b, &[evil], Scope::DEFAULT).unwrap(), 0);
        let mut evil = all(&a)[0].clone();
        evil.data.insert("value\"); DROP TABLE settings; --".into(), serde_json::json!(1));
        assert!(apply(&b, &[evil], Scope::DEFAULT).is_err() || b.get_setting::<String>("general.locale").unwrap().is_none());
        let mut dev = all(&a)[0].clone();
        dev.data.insert("key".into(), serde_json::json!("device.name"));
        assert_eq!(apply(&b, &[dev], Scope::DEFAULT).unwrap(), 0);
    }
}
