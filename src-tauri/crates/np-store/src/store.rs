use std::{path::Path, sync::Mutex, time::Duration};

use rusqlite::{Connection, OptionalExtension, Transaction};

use crate::{migrations, StoreError};

pub struct Store {
    conn: Mutex<Connection>,
    device_id: String,
    clock: crate::HlcClock,
    pub(crate) observers: Mutex<Vec<(String, crate::settings::SettingObserver)>>,
}

impl Store {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, StoreError> {
        if let Some(parent) = path.as_ref().parent() {
            std::fs::create_dir_all(parent)?;
        }
        Self::init(Connection::open(path)?)
    }

    pub fn open_in_memory() -> Result<Self, StoreError> {
        Self::init(Connection::open_in_memory()?)
    }

    fn init(mut conn: Connection) -> Result<Self, StoreError> {
        conn.pragma_update_and_check(None, "journal_mode", "WAL", |_| Ok(()))?;
        conn.pragma_update(None, "foreign_keys", true)?;
        conn.busy_timeout(Duration::from_secs(5))?;
        migrations::migrate(&mut conn)?;
        let device_id = ensure_device_id(&conn)?;
        let clock = crate::HlcClock::new(device_id[..8].to_string());
        Ok(Self { conn: Mutex::new(conn), device_id, clock, observers: Mutex::new(Vec::new()) })
    }

    /// UUID v4 de este dispositivo (tabla `local_meta`, nunca se sincroniza).
    pub fn device_id(&self) -> &str {
        &self.device_id
    }

    pub fn clock(&self) -> &crate::HlcClock {
        &self.clock
    }

    /// Siguiente marca HLC codificada para `updated_at`.
    pub fn stamp(&self) -> String {
        self.clock.now().to_string()
    }

    pub fn user_version(&self) -> Result<u32, StoreError> {
        self.with_conn(|c| c.pragma_query_value(None, "user_version", |r| r.get(0)))
    }

    pub fn with_conn<T>(&self, f: impl FnOnce(&Connection) -> rusqlite::Result<T>) -> Result<T, StoreError> {
        let conn = self.conn.lock().map_err(|_| StoreError::Poisoned)?;
        Ok(f(&conn)?)
    }

    pub fn with_tx<T>(&self, f: impl FnOnce(&Transaction<'_>) -> rusqlite::Result<T>) -> Result<T, StoreError> {
        let mut conn = self.conn.lock().map_err(|_| StoreError::Poisoned)?;
        let tx = conn.transaction()?;
        let out = f(&tx)?;
        tx.commit()?;
        Ok(out)
    }
}

fn ensure_device_id(conn: &Connection) -> Result<String, StoreError> {
    let existing: Option<String> = conn
        .query_row("SELECT value FROM local_meta WHERE key = 'device_id'", [], |r| r.get(0))
        .optional()?;
    if let Some(id) = existing {
        return Ok(id);
    }
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute("INSERT INTO local_meta(key, value) VALUES ('device_id', ?1)", [&id])?;
    Ok(id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opens_file_db_and_keeps_device_id() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("np.sqlite");
        let id = Store::open(&path).unwrap().device_id().to_string();
        assert_eq!(id.len(), 36);
        assert_eq!(Store::open(&path).unwrap().device_id(), id);
    }

    #[test]
    fn with_tx_rolls_back_on_error() {
        let s = Store::open_in_memory().unwrap();
        let r: Result<(), StoreError> = s.with_tx(|tx| {
            tx.execute("INSERT INTO local_meta(key, value) VALUES ('k', 'v')", [])?;
            Err(rusqlite::Error::InvalidQuery)
        });
        assert!(r.is_err());
        let n: i64 = s.with_conn(|c| c.query_row("SELECT count(*) FROM local_meta WHERE key='k'", [], |r| r.get(0))).unwrap();
        assert_eq!(n, 0);
    }

    #[test]
    fn store_is_send_and_sync() {
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<Store>();
    }

    #[test]
    fn stamps_are_increasing_and_carry_device_node() {
        let s = Store::open_in_memory().unwrap();
        let a = s.stamp();
        let b = s.stamp();
        assert!(a < b);
        assert!(a.ends_with(&s.device_id()[..8]));
    }

}
