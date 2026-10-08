//! Ajustes clave-valor JSON tipados, sincronizables (id estable, HLC, lápida).
use rusqlite::{params, OptionalExtension};
use serde::{de::DeserializeOwned, Serialize};
use serde_json::Value;

use crate::{ids::stable_id, Store, StoreError};

pub type SettingObserver = Box<dyn Fn(&str, &Value) + Send + Sync>;

pub fn validate_key(key: &str) -> Result<(), StoreError> {
    let ok = !key.is_empty()
        && key.len() <= 128
        && key.contains('.')
        && key.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'.' || b == b'_' || b == b'-' || b.is_ascii_uppercase());
    if ok && key.chars().next().is_some_and(|c| c.is_ascii_lowercase()) {
        Ok(())
    } else {
        Err(StoreError::Secret(format!("invalid setting key: {key}")))
    }
}

impl Store {
    pub fn get_setting<T: DeserializeOwned>(&self, key: &str) -> Result<Option<T>, StoreError> {
        let raw: Option<String> = self.with_conn(|c| {
            c.query_row("SELECT value FROM settings WHERE key = ?1 AND deleted = 0", [key], |r| r.get(0))
                .optional()
        })?;
        raw.map(|s| serde_json::from_str(&s).map_err(StoreError::from)).transpose()
    }

    pub fn set_setting<T: Serialize>(&self, key: &str, value: &T) -> Result<(), StoreError> {
        validate_key(key)?;
        let json = serde_json::to_value(value)?;
        let text = serde_json::to_string(&json)?;
        let stamp = self.stamp();
        self.with_conn(|c| {
            c.execute(
                "INSERT INTO settings(key, id, value, updated_at, deleted) VALUES (?1, ?2, ?3, ?4, 0)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, deleted = 0",
                params![key, stable_id("settings", key), text, stamp],
            )
        })?;
        self.notify_setting(key, &json);
        Ok(())
    }

    pub fn delete_setting(&self, key: &str) -> Result<(), StoreError> {
        validate_key(key)?;
        let stamp = self.stamp();
        let changed = self.with_conn(|c| {
            c.execute(
                "UPDATE settings SET deleted = 1, value = 'null', updated_at = ?2 WHERE key = ?1 AND deleted = 0",
                params![key, stamp],
            )
        })?;
        if changed > 0 {
            self.notify_setting(key, &Value::Null);
        }
        Ok(())
    }

    pub fn list_settings(&self, prefix: &str) -> Result<Vec<(String, Value)>, StoreError> {
        let rows: Vec<(String, String)> = self.with_conn(|c| {
            let mut st = c.prepare("SELECT key, value FROM settings WHERE deleted = 0 AND substr(key, 1, length(?1)) = ?1 ORDER BY key")?;
            let rows = st.query_map([prefix], |r| Ok((r.get(0)?, r.get(1)?)))?;
            rows.collect()
        })?;
        rows.into_iter()
            .map(|(k, v)| Ok((k, serde_json::from_str(&v)?)))
            .collect()
    }

    pub fn on_setting_change(&self, prefix: &str, f: impl Fn(&str, &Value) + Send + Sync + 'static) {
        self.observers.lock().expect("observers lock").push((prefix.to_string(), Box::new(f)));
    }

    fn notify_setting(&self, key: &str, value: &Value) {
        let obs = self.observers.lock().expect("observers lock");
        for (prefix, f) in obs.iter() {
            if key.starts_with(prefix.as_str()) {
                f(key, value);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::Store;
    use serde_json::{json, Value};
    use std::sync::{Arc, Mutex};

    #[test]
    fn set_get_round_trip_with_types() {
        let s = Store::open_in_memory().unwrap();
        assert_eq!(s.get_setting::<String>("appearance.theme").unwrap(), None);
        s.set_setting("appearance.theme", &"ink").unwrap();
        s.set_setting("history.retentionDays", &Some(30)).unwrap();
        assert_eq!(s.get_setting::<String>("appearance.theme").unwrap().as_deref(), Some("ink"));
        assert_eq!(s.get_setting::<Option<u32>>("history.retentionDays").unwrap(), Some(Some(30)));
    }

    #[test]
    fn rows_carry_stable_id_and_increasing_hlc() {
        let s = Store::open_in_memory().unwrap();
        s.set_setting("reader.autoOpen", &true).unwrap();
        let (id1, u1): (String, String) = s
            .with_conn(|c| c.query_row("SELECT id, updated_at FROM settings WHERE key='reader.autoOpen'", [], |r| Ok((r.get(0)?, r.get(1)?))))
            .unwrap();
        s.set_setting("reader.autoOpen", &false).unwrap();
        let (id2, u2): (String, String) = s
            .with_conn(|c| c.query_row("SELECT id, updated_at FROM settings WHERE key='reader.autoOpen'", [], |r| Ok((r.get(0)?, r.get(1)?))))
            .unwrap();
        assert_eq!(id1, id2);
        assert_eq!(id1, crate::ids::stable_id("settings", "reader.autoOpen"));
        assert!(u2 > u1);
    }

    #[test]
    fn delete_leaves_tombstone_and_hides_value() {
        let s = Store::open_in_memory().unwrap();
        s.set_setting("history.paused", &true).unwrap();
        s.delete_setting("history.paused").unwrap();
        assert_eq!(s.get_setting::<bool>("history.paused").unwrap(), None);
        let deleted: i64 = s.with_conn(|c| c.query_row("SELECT deleted FROM settings WHERE key='history.paused'", [], |r| r.get(0))).unwrap();
        assert_eq!(deleted, 1);
        s.set_setting("history.paused", &false).unwrap();
        assert_eq!(s.get_setting::<bool>("history.paused").unwrap(), Some(false));
    }

    #[test]
    fn list_by_prefix_skips_tombstones() {
        let s = Store::open_in_memory().unwrap();
        s.set_setting("history.paused", &true).unwrap();
        s.set_setting("history.retentionDays", &90).unwrap();
        s.set_setting("appearance.theme", &"paper").unwrap();
        s.delete_setting("history.paused").unwrap();
        assert_eq!(s.list_settings("history.").unwrap(), vec![("history.retentionDays".to_string(), json!(90))]);
    }

    #[test]
    fn rejects_invalid_keys() {
        let s = Store::open_in_memory().unwrap();
        assert!(s.set_setting("NoDots", &1).is_err());
        assert!(s.set_setting("a b.c", &1).is_err());
        assert!(s.set_setting(&"x.".repeat(100), &1).is_err());
    }

    #[test]
    fn observers_are_notified_by_prefix() {
        let s = Store::open_in_memory().unwrap();
        let seen: Arc<Mutex<Vec<(String, Value)>>> = Arc::default();
        let sink = seen.clone();
        s.on_setting_change("privacy.", move |k, v| sink.lock().unwrap().push((k.to_string(), v.clone())));
        s.set_setting("privacy.mode", &"tor").unwrap();
        s.set_setting("appearance.theme", &"ink").unwrap();
        s.delete_setting("privacy.mode").unwrap();
        assert_eq!(
            *seen.lock().unwrap(),
            vec![("privacy.mode".to_string(), json!("tor")), ("privacy.mode".to_string(), Value::Null)]
        );
    }
}
