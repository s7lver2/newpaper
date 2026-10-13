//! Filas sincronizables: diario, exportación y fusión "el último que escribe gana" (§15).
use std::{
    collections::{HashMap, HashSet},
    str::FromStr,
};

use np_store::{ids::stable_id, Hlc, Store};
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

/// Un HLC remoto más allá de ahora + este margen se rechaza: envenenaría el reloj local para siempre.
pub const MAX_CLOCK_SKEW_MS: u64 = 24 * 3600 * 1000;
/// Tamaño máximo de un valor de texto de una fila remota.
pub const MAX_VALUE_BYTES: usize = 4 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Row {
    pub seq: i64,
    pub table: String,
    pub data: Map<String, Value>,
}

fn scope_of(table: &str) -> Option<Scope> {
    TABLES.iter().find(|(t, _)| *t == table).map(|(_, s)| *s)
}

/// Ajustes que viajan entre equipos: solo apariencia, idioma y lectura. Todo lo demás es local y NUNCA se
/// envía ni se acepta: privacidad y red (`privacy.*`, Tor, bloqueo), IA (`ai.*`, endpoints propios, límites),
/// búsqueda, historial (`history.*`), `device.*` y cualquier clave desconocida. Un par comprometido no puede
/// así degradar la privacidad ni redirigir las claves de API a un servidor suyo.
pub fn syncable_setting_key(key: &str) -> bool {
    matches!(key, "general.locale" | "content.locale" | "appearance.theme" | "appearance.pageTransition" | "reader.autoOpen" | "reader.sizeStep")
}

fn syncable_setting_value(key: &str, v: &Value) -> bool {
    match key {
        "general.locale" | "content.locale" => v.as_str().is_some_and(|s| (2..=16).contains(&s.len()) && s.bytes().all(|b| b.is_ascii_alphabetic() || b == b'-')),
        "appearance.theme" => matches!(v.as_str(), Some("paper" | "ink" | "system")),
        "appearance.pageTransition" | "reader.autoOpen" => v.is_boolean(),
        "reader.sizeStep" => v.as_i64().is_some_and(|n| (-10..=10).contains(&n)),
        _ => false,
    }
}

/// Valida una fila de `settings` (clave permitida, valor del tipo esperado, `id` derivado de la clave).
fn setting_row_ok(data: &Map<String, Value>) -> bool {
    let Some(key) = data.get("key").and_then(|k| k.as_str()) else { return false };
    if !syncable_setting_key(key) || data.get("id").and_then(|v| v.as_str()) != Some(stable_id("settings", key).as_str()) {
        return false;
    }
    if data.get("deleted").and_then(|d| d.as_i64()) == Some(1) {
        return true; // lápida: solo importa la clave
    }
    data.get("value").and_then(|v| v.as_str()).and_then(|s| serde_json::from_str::<Value>(s).ok()).is_some_and(|v| syncable_setting_value(key, &v))
}

fn is_http_url(s: &str) -> bool {
    s.len() <= 4096 && (s.starts_with("https://") || s.starts_with("http://")) && !s.chars().any(|c| c.is_control() || c.is_whitespace())
}

fn str_of<'a>(data: &'a Map<String, Value>, k: &str) -> Option<&'a str> {
    data.get(k).and_then(|v| v.as_str())
}

fn valid_domain(d: &str) -> bool {
    (3..=253).contains(&d.len()) && d.contains('.') && d.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'.' || b == b'-')
}

fn valid_hlc(s: &str, now_ms: u64) -> bool {
    Hlc::from_str(s).is_ok_and(|h| h.to_string() == s && h.millis <= now_ms.saturating_add(MAX_CLOCK_SKEW_MS) && h.node.len() <= 40 && h.node.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-'))
}

fn now_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// Validación de una fila remota antes de tocar la base de datos. Devuelve `(id, updated_at)`.
fn validate(table: &str, data: &Map<String, Value>, now_ms: u64) -> Option<(String, String)> {
    for v in data.values() {
        match v {
            Value::Null | Value::Bool(_) | Value::Number(_) => {}
            Value::String(s) if s.len() <= MAX_VALUE_BYTES => {}
            _ => return None,
        }
    }
    let id = str_of(data, "id")?;
    if id.is_empty() || id.len() > 128 || !id.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b':')) {
        return None;
    }
    let updated = str_of(data, "updated_at")?;
    if !valid_hlc(updated, now_ms) {
        return None;
    }
    if data.get("deleted").is_some_and(|d| !matches!(d.as_i64(), Some(0 | 1))) {
        return None;
    }
    for col in ["url", "article_url"] {
        if let Some(Value::String(u)) = data.get(col) {
            if !is_http_url(u) {
                return None;
            }
        }
    }
    let derived = |kind: &str, natural: &str| id == stable_id(kind, natural);
    let ok = match table {
        "settings" => setting_row_ok(data),
        "saved_articles" => str_of(data, "url").is_some_and(|u| derived("saved", u)) && str_of(data, "article_json").is_some_and(|j| serde_json::from_str::<Value>(j).is_ok()),
        "custom_outlets" => {
            str_of(data, "domain").is_some_and(|d| valid_domain(d) && derived("custom_outlet", d))
                && str_of(data, "feeds_json").and_then(|j| serde_json::from_str::<Vec<String>>(j).ok()).is_some_and(|f| f.len() <= 50 && f.iter().all(|u| is_http_url(u)))
        }
        "topics" => str_of(data, "topic_id").is_some_and(|t| t.len() <= 128 && derived("topic", t)),
        "outlet_overrides" => str_of(data, "outlet_id").is_some_and(|o| o.len() <= 128 && derived("outlet_override", o)),
        "analyses" => match (str_of(data, "url"), str_of(data, "text_hash"), str_of(data, "stage"), str_of(data, "json")) {
            (Some(u), Some(h), Some(s), Some(j)) => derived("analysis", &format!("{u}|{h}|{s}")) && serde_json::from_str::<Value>(j).is_ok(),
            _ => false,
        },
        "history" | "watches" => true,
        _ => false,
    };
    ok.then(|| (id.to_string(), updated.to_string()))
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
                // Los ajustes salen solo si están en la lista de ajustes sincronizables (nunca privacidad, IA ni `device.*`).
                if tbl == "settings" && !data.get("key").and_then(|k| k.as_str()).is_some_and(syncable_setting_key) {
                    continue;
                }
                out.push(Row { seq, table: tbl, data });
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

#[derive(Debug, Default, Clone)]
pub struct ApplyReport {
    pub applied: usize,
    pub rejected: usize,
    /// Claves de ajustes que cambiaron (para avisar a los observadores).
    pub settings: Vec<String>,
}

/// Aplica filas remotas: gana el `updated_at` (HLC) mayor; los empates no cambian nada.
///
/// Cada fila se valida antes de tocar la base de datos (tabla y columnas conocidas, ámbito, lista de ajustes,
/// `id` derivado de la clave natural, HLC canónico y no futuro, URLs http/https, tamaños). Las filas no válidas
/// se descartan sin abortar el resto y no mueven el reloj local.
///
/// Las filas existentes se actualizan con `UPDATE` (los disparadores de FTS de la hemeroteca siguen
/// funcionando). Una fila nueva que choca con otra clave natural (p. ej. el mismo dominio en dos equipos) se
/// omite en lugar de bloquear toda la sincronización.
pub fn apply_report(store: &Store, rows: &[Row], scopes: &[Scope]) -> Result<ApplyReport> {
    let wanted: HashSet<Scope> = scopes.iter().copied().collect();
    let now = now_ms();
    let mut report = ApplyReport::default();
    let mut accepted: Vec<(&Row, String, String)> = Vec::new();
    for r in rows {
        let ok = scope_of(&r.table).is_some_and(|s| wanted.contains(&s));
        match ok.then(|| validate(&r.table, &r.data, now)).flatten() {
            Some((id, updated)) => accepted.push((r, id, updated)),
            None => report.rejected += 1,
        }
    }
    let result = store.with_tx(|tx| {
        let mut cols_cache: HashMap<String, HashSet<String>> = HashMap::new();
        let mut applied: Vec<(usize, bool)> = Vec::new();
        let mut observed: Vec<Hlc> = Vec::new();
        for (i, (r, id, remote)) in accepted.iter().enumerate() {
            if !cols_cache.contains_key(&r.table) {
                cols_cache.insert(r.table.clone(), columns(tx, &r.table)?);
            }
            let cols = &cols_cache[&r.table];
            if r.data.keys().any(|k| !cols.contains(k)) {
                applied.push((i, false)); // columna desconocida (¿versión distinta?): se descarta la fila
                continue;
            }
            if let Ok(h) = Hlc::from_str(remote) {
                observed.push(h);
            }
            let local: Option<String> = tx.query_row(&format!("SELECT updated_at FROM {} WHERE id = ?1", r.table), [id], |x| x.get(0)).optional()?;
            if local.as_deref().is_some_and(|l| l >= remote.as_str()) {
                continue;
            }
            let names: Vec<&String> = r.data.keys().collect();
            let mut values: Vec<rusqlite::types::Value> = names.iter().map(|n| to_sql(&r.data[*n])).collect();
            let changed = if local.is_some() {
                let sets = names.iter().enumerate().map(|(i, n)| format!("\"{n}\" = ?{}", i + 1)).collect::<Vec<_>>().join(", ");
                values.push(rusqlite::types::Value::Text(id.clone()));
                let sql = format!("UPDATE OR IGNORE {} SET {sets} WHERE id = ?{}", r.table, names.len() + 1);
                tx.execute(&sql, rusqlite::params_from_iter(values))?
            } else {
                let cols_sql = names.iter().map(|n| format!("\"{n}\"")).collect::<Vec<_>>().join(", ");
                let placeholders = (1..=names.len()).map(|i| format!("?{i}")).collect::<Vec<_>>().join(", ");
                let sql = format!("INSERT OR IGNORE INTO {} ({cols_sql}) VALUES ({placeholders})", r.table);
                tx.execute(&sql, rusqlite::params_from_iter(values))?
            };
            if changed > 0 {
                applied.push((i, true));
            }
        }
        Ok((applied, observed))
    });
    let (applied, observed) = result.map_err(|e| SyncError::Store(e.to_string()))?;
    // El reloj solo avanza con marcas de filas aceptadas, válidas y no futuras.
    for h in &observed {
        store.clock().observe(h);
    }
    for (i, ok) in applied {
        if ok {
            report.applied += 1;
            let (r, _, _) = &accepted[i];
            if r.table == "settings" {
                if let Some(k) = str_of(&r.data, "key") {
                    report.settings.push(k.to_string());
                }
            }
        } else {
            report.rejected += 1;
        }
    }
    Ok(report)
}

pub fn apply(store: &Store, rows: &[Row], scopes: &[Scope]) -> Result<usize> {
    Ok(apply_report(store, rows, scopes)?.applied)
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

#[cfg(test)]
mod security_tests {
    use super::*;
    use np_store::Store;
    use serde_json::json;

    fn setting_row(key: &str, value: Value, stamp: &str) -> Row {
        let mut data = Map::new();
        data.insert("key".into(), json!(key));
        data.insert("id".into(), json!(stable_id("settings", key)));
        data.insert("value".into(), json!(value.to_string()));
        data.insert("updated_at".into(), json!(stamp));
        data.insert("deleted".into(), json!(0));
        Row { seq: 1, table: "settings".into(), data }
    }

    fn stamp(millis: u64) -> String {
        format!("{millis:013}-00000-abcd1234")
    }

    #[test]
    fn a_peer_can_never_set_privacy_ai_endpoint_or_device_settings() {
        let b = Store::open_in_memory().unwrap();
        let t = stamp(now_ms());
        let evil = [
            setting_row("privacy.mode", json!("direct"), &t),
            setting_row("privacy.feedsViaTor", json!(false), &t),
            setting_row("ai.customEndpoints", json!([{"id": "x", "baseUrl": "https://evil.example"}]), &t),
            setting_row("ai.connected", json!(["custom:evil"]), &t),
            setting_row("adblock.settings", json!({}), &t),
            setting_row("history.paused", json!(false), &t),
            setting_row("history.retentionDays", json!(1), &t),
            setting_row("device.sync.enabled", json!(true), &t),
            setting_row("device.name", json!("x"), &t),
            setting_row("search.brave", json!("k"), &t),
        ];
        let report = apply_report(&b, &evil, Scope::DEFAULT).unwrap();
        assert_eq!(report.applied, 0);
        assert_eq!(report.rejected, evil.len());
        assert!(b.list_settings("").unwrap().is_empty());
    }

    #[test]
    fn allowed_settings_are_type_checked_and_must_use_the_derived_id() {
        let b = Store::open_in_memory().unwrap();
        let t = stamp(now_ms());
        assert_eq!(apply(&b, &[setting_row("appearance.theme", json!("ink"), &t)], Scope::DEFAULT).unwrap(), 1);
        assert_eq!(apply(&b, &[setting_row("appearance.theme", json!({"x": 1}), &stamp(now_ms() + 1))], Scope::DEFAULT).unwrap(), 0, "wrong type");
        assert_eq!(apply(&b, &[setting_row("reader.autoOpen", json!("yes"), &t)], Scope::DEFAULT).unwrap(), 0);
        // El id de la fila de un ajuste permitido con la clave de otro no vale (no se puede reescribir una fila por su id).
        let mut swapped = setting_row("privacy.mode", json!("direct"), &stamp(now_ms() + 5));
        swapped.data.insert("id".into(), json!(stable_id("settings", "appearance.theme")));
        assert_eq!(apply(&b, &[swapped], Scope::DEFAULT).unwrap(), 0);
        let mut renamed = setting_row("appearance.theme", json!("paper"), &stamp(now_ms() + 5));
        renamed.data.insert("key".into(), json!("privacy.mode"));
        assert_eq!(apply(&b, &[renamed], Scope::DEFAULT).unwrap(), 0);
        assert_eq!(b.get_setting::<String>("appearance.theme").unwrap().as_deref(), Some("ink"));
        assert_eq!(b.get_setting::<String>("privacy.mode").unwrap(), None);
    }

    #[test]
    fn local_only_settings_are_not_exported_either() {
        let a = Store::open_in_memory().unwrap();
        a.set_setting("privacy.mode", &"direct").unwrap();
        a.set_setting("ai.customEndpoints", &json!([])).unwrap();
        a.set_setting("appearance.theme", &"ink").unwrap();
        let keys: Vec<String> = changes_after(&a, Scope::DEFAULT, 0, 1000).unwrap().0.iter().filter_map(|r| str_of(&r.data, "key").map(String::from)).collect();
        assert_eq!(keys, ["appearance.theme"]);
    }

    #[test]
    fn hlc_poisoning_is_rejected_and_does_not_move_the_local_clock() {
        let b = Store::open_in_memory().unwrap();
        let before = b.clock().now();
        let far = stamp(now_ms() + 3 * MAX_CLOCK_SKEW_MS);
        assert_eq!(apply(&b, &[setting_row("appearance.theme", json!("ink"), &far)], Scope::DEFAULT).unwrap(), 0);
        let after = b.clock().now();
        assert!(after.millis < before.millis + 60_000, "clock must not jump to the peer's future");
        // Formato no canónico: "9" > "1760..." como texto, así que ganaría siempre.
        for bad in ["9-1-x", "99999999999999999-00000-abcd", "0001760000000-00000-", "0001760000000-0-abcd", "zzzz", "0001760000000-00000-ab cd", "+1760000000000-00000-abcd"] {
            assert_eq!(apply(&b, &[setting_row("appearance.theme", json!("ink"), bad)], Scope::DEFAULT).unwrap(), 0, "{bad}");
        }
    }

    #[test]
    fn row_values_are_validated_before_touching_the_database() {
        let (a, b) = (Store::open_in_memory().unwrap(), Store::open_in_memory().unwrap());
        a.with_conn(|c| {
            c.execute("INSERT INTO history(id, kind, url, title, at, updated_at) VALUES ('h1', 'visit', 'https://a.test/x', 'T', 1, ?1)", [stamp(now_ms())])?;
            Ok(())
        })
        .unwrap();
        let good = changes_after(&a, Scope::DEFAULT, 0, 100).unwrap().0;
        assert_eq!(apply(&b, &good, Scope::DEFAULT).unwrap(), 1);

        let mut js = good[0].clone();
        js.data.insert("id".into(), json!("h2"));
        js.data.insert("url".into(), json!("javascript:alert(1)"));
        let mut file = js.clone();
        file.data.insert("id".into(), json!("h3"));
        file.data.insert("url".into(), json!("file:///C:/Windows/win.ini"));
        let mut nested = good[0].clone();
        nested.data.insert("id".into(), json!("h4"));
        nested.data.insert("title".into(), json!({"a": [1]}));
        let mut kind = good[0].clone();
        kind.data.insert("id".into(), json!("h5"));
        kind.data.insert("kind".into(), json!("evil")); // viola el CHECK de la tabla: se ignora, no aborta
        let mut huge = good[0].clone();
        huge.data.insert("id".into(), json!("h6"));
        huge.data.insert("title".into(), json!("x".repeat(MAX_VALUE_BYTES + 1)));
        let mut badid = good[0].clone();
        badid.data.insert("id".into(), json!("h7'; DROP TABLE history; --"));
        assert_eq!(apply(&b, &[js, file, nested, kind, huge, badid], Scope::DEFAULT).unwrap(), 0);
        let n: i64 = b.with_conn(|c| c.query_row("SELECT count(*) FROM history", [], |r| r.get(0))).unwrap();
        assert_eq!(n, 1);
    }

    #[test]
    fn natural_key_rows_need_their_derived_id_and_valid_payloads() {
        let b = Store::open_in_memory().unwrap();
        let t = stamp(now_ms());
        let mut saved = Map::new();
        for (k, v) in [
            ("url", json!("https://a.test/1")),
            ("id", json!(stable_id("saved", "https://a.test/1"))),
            ("title", json!("T")),
            ("outlet", json!("A")),
            ("article_json", json!("{}")),
            ("saved_at", json!(1)),
            ("updated_at", json!(t)),
            ("deleted", json!(0)),
        ] {
            saved.insert(k.into(), v);
        }
        let ok = Row { seq: 1, table: "saved_articles".into(), data: saved.clone() };
        assert_eq!(apply(&b, &[ok.clone()], Scope::DEFAULT).unwrap(), 1);
        // Reescribir otra fila cambiando su URL natural: el id ya no coincide.
        let mut moved = ok.clone();
        moved.data.insert("url".into(), json!("https://evil.test/"));
        moved.data.insert("updated_at".into(), json!(stamp(now_ms() + 10)));
        assert_eq!(apply(&b, &[moved], Scope::DEFAULT).unwrap(), 0);
        let mut bad_json = ok.clone();
        bad_json.data.insert("article_json".into(), json!("not json"));
        bad_json.data.insert("updated_at".into(), json!(stamp(now_ms() + 10)));
        assert_eq!(apply(&b, &[bad_json], Scope::DEFAULT).unwrap(), 0);

        // Medios propios: dominio válido y feeds http(s).
        let mut outlet = Map::new();
        for (k, v) in [
            ("domain", json!("blog.example.org")),
            ("id", json!(stable_id("custom_outlet", "blog.example.org"))),
            ("name", json!("Blog")),
            ("feeds_json", json!("[\"https://blog.example.org/feed\"]")),
            ("language", json!("es")),
            ("country", json!("ES")),
            ("updated_at", json!(t)),
            ("deleted", json!(0)),
        ] {
            outlet.insert(k.into(), v);
        }
        let row = Row { seq: 2, table: "custom_outlets".into(), data: outlet.clone() };
        assert_eq!(apply(&b, &[row.clone()], Scope::DEFAULT).unwrap(), 1);
        let mut evil_feed = row.clone();
        evil_feed.data.insert("domain".into(), json!("evil.example.org"));
        evil_feed.data.insert("id".into(), json!(stable_id("custom_outlet", "evil.example.org")));
        evil_feed.data.insert("feeds_json".into(), json!("[\"file:///etc/passwd\"]"));
        assert_eq!(apply(&b, &[evil_feed], Scope::DEFAULT).unwrap(), 0);
    }

    #[test]
    fn history_search_still_finds_rows_after_a_merge() {
        let (a, b) = (Store::open_in_memory().unwrap(), Store::open_in_memory().unwrap());
        a.with_conn(|c| {
            c.execute("INSERT INTO history(id, kind, url, title, outlet, at, updated_at) VALUES ('h1', 'visit', 'https://a.test/x', 'Elecciones generales', 'A', 1, ?1)", [stamp(now_ms() - 5000)])?;
            Ok(())
        })
        .unwrap();
        apply(&b, &changes_after(&a, Scope::DEFAULT, 0, 100).unwrap().0, Scope::DEFAULT).unwrap();
        let hits = |q: &str| -> i64 { b.with_conn(|c| c.query_row("SELECT count(*) FROM history_fts WHERE history_fts MATCH ?1", [q], |r| r.get(0))).unwrap() };
        assert_eq!(hits("elecciones"), 1);
        // Una actualización posterior reindexa: ya no aparece con el título viejo y sí con el nuevo.
        a.with_conn(|c| c.execute("UPDATE history SET title = 'Segunda vuelta', updated_at = ?1 WHERE id = 'h1'", [stamp(now_ms())])).unwrap();
        apply(&b, &changes_after(&a, Scope::DEFAULT, 0, 100).unwrap().0, Scope::DEFAULT).unwrap();
        assert_eq!(hits("elecciones"), 0);
        assert_eq!(hits("vuelta"), 1);
    }
}
