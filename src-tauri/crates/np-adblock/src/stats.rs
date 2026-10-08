//! Contadores de peticiones bloqueadas: por pestaña (memoria) y por día (SQLite).

use std::{collections::HashMap, sync::Mutex};

use rusqlite::{params, Connection, OptionalExtension};

pub const SCHEMA_SQL: &str = include_str!("../sql/blocked_stats.sql");

#[derive(Default)]
struct Inner {
    per_tab: HashMap<u64, u64>,
    pending: HashMap<String, u64>,
}

#[derive(Default)]
pub struct BlockedStats {
    inner: Mutex<Inner>,
}

impl BlockedStats {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn record(&self, tab: u64, day: &str) -> u64 {
        let mut g = self.inner.lock().expect("stats lock");
        *g.pending.entry(day.to_owned()).or_default() += 1;
        let c = g.per_tab.entry(tab).or_default();
        *c += 1;
        *c
    }

    pub fn tab_count(&self, tab: u64) -> u64 {
        self.inner.lock().expect("stats lock").per_tab.get(&tab).copied().unwrap_or(0)
    }

    pub fn remove_tab(&self, tab: u64) {
        self.inner.lock().expect("stats lock").per_tab.remove(&tab);
    }

    pub fn tab_counts(&self) -> HashMap<u64, u64> {
        self.inner.lock().expect("stats lock").per_tab.clone()
    }

    /// Vuelca los pendientes con UPSERT. Si falla, los pendientes se conservan.
    pub fn flush(&self, conn: &Connection) -> rusqlite::Result<()> {
        let pending = std::mem::take(&mut self.inner.lock().expect("stats lock").pending);
        let result = (|| {
            for (day, n) in &pending {
                conn.execute(
                    "INSERT INTO blocked_stats (day, blocked) VALUES (?1, ?2)
                     ON CONFLICT(day) DO UPDATE SET blocked = blocked + excluded.blocked",
                    params![day, *n as i64],
                )?;
            }
            Ok(())
        })();
        if result.is_err() {
            let mut g = self.inner.lock().expect("stats lock");
            for (day, n) in pending {
                *g.pending.entry(day).or_default() += n;
            }
        }
        result
    }

    pub fn day_total(&self, conn: &Connection, day: &str) -> rusqlite::Result<u64> {
        let stored: Option<i64> = conn
            .query_row("SELECT blocked FROM blocked_stats WHERE day = ?1", [day], |r| r.get(0))
            .optional()?;
        let pending = self.inner.lock().expect("stats lock").pending.get(day).copied().unwrap_or(0);
        Ok(stored.unwrap_or(0) as u64 + pending)
    }
}

pub fn today_local() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(SCHEMA_SQL).unwrap();
        c
    }

    #[test]
    fn counts_per_tab() {
        let s = BlockedStats::new();
        assert_eq!(s.record(1, "2026-10-06"), 1);
        assert_eq!(s.record(1, "2026-10-06"), 2);
        assert_eq!(s.record(2, "2026-10-06"), 1);
        assert_eq!(s.tab_count(1), 2);
        s.remove_tab(1);
        assert_eq!(s.tab_count(1), 0);
        assert_eq!(s.tab_count(2), 1);
    }

    #[test]
    fn flush_accumulates_per_day_and_day_total_includes_pending() {
        let conn = db();
        let s = BlockedStats::new();
        s.record(1, "2026-10-06");
        s.record(2, "2026-10-06");
        s.record(2, "2026-10-07");
        s.flush(&conn).unwrap();
        s.record(1, "2026-10-06");

        assert_eq!(s.day_total(&conn, "2026-10-06").unwrap(), 3);
        assert_eq!(s.day_total(&conn, "2026-10-07").unwrap(), 1);
        s.flush(&conn).unwrap();
        let stored: i64 = conn
            .query_row("SELECT blocked FROM blocked_stats WHERE day = '2026-10-06'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(stored, 3);
        assert_eq!(s.day_total(&conn, "2026-10-08").unwrap(), 0);
    }

    #[test]
    fn failed_flush_keeps_pending_counts() {
        let conn = Connection::open_in_memory().unwrap(); // sin tabla: el flush falla
        let s = BlockedStats::new();
        s.record(1, "2026-10-06");
        assert!(s.flush(&conn).is_err());
        conn.execute_batch(SCHEMA_SQL).unwrap();
        s.flush(&conn).unwrap();
        assert_eq!(s.day_total(&conn, "2026-10-06").unwrap(), 1);
    }

    #[test]
    fn today_has_iso_format() {
        let d = today_local();
        assert_eq!(d.len(), 10);
        assert_eq!(&d[4..5], "-");
    }
}
