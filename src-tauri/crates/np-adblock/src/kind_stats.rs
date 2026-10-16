//! Contadores del móvil: peticiones bloqueadas por categoría (anuncios y rastreadores), hoy y en total.
//!
//! `record` se llama desde los hilos de red de la webview (`shouldInterceptRequest`), así que solo toca dos atómicos.
//! Un vuelco periódico (`flush`) los suma en SQLite (una fila por día y categoría). La tabla se crea sola
//! (`CREATE TABLE IF NOT EXISTS`) y no se sincroniza: son datos de este teléfono.
use std::sync::atomic::{AtomicU64, Ordering};

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

use crate::blocker::BlockKind;

const SCHEMA: &str = "CREATE TABLE IF NOT EXISTS block_kind_stats (
  day  TEXT NOT NULL,
  kind TEXT NOT NULL,
  n    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, kind)
)";

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
pub struct Kinds {
    pub ads: u64,
    pub trackers: u64,
}

impl Kinds {
    fn add(&mut self, other: Kinds) {
        self.ads += other.ads;
        self.trackers += other.trackers;
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BlockCounts {
    pub today: Kinds,
    pub total: Kinds,
    /// Primer día con bloqueos desde el último reinicio de los contadores (`YYYY-MM-DD`).
    pub since: Option<String>,
}

#[derive(Default)]
pub struct KindCounter {
    ads: AtomicU64,
    trackers: AtomicU64,
}

impl KindCounter {
    pub fn new() -> Self {
        Self::default()
    }

    /// Barato y seguro entre hilos.
    pub fn record(&self, kind: BlockKind) {
        match kind {
            BlockKind::Ad => self.ads.fetch_add(1, Ordering::Relaxed),
            BlockKind::Tracker => self.trackers.fetch_add(1, Ordering::Relaxed),
        };
    }

    fn pending(&self) -> Kinds {
        Kinds { ads: self.ads.load(Ordering::Relaxed), trackers: self.trackers.load(Ordering::Relaxed) }
    }

    /// Vuelca lo pendiente en el día `day`. Si falla, lo pendiente se conserva.
    pub fn flush(&self, conn: &Connection, day: &str) -> rusqlite::Result<()> {
        let taken = Kinds { ads: self.ads.swap(0, Ordering::Relaxed), trackers: self.trackers.swap(0, Ordering::Relaxed) };
        if taken == Kinds::default() {
            return Ok(());
        }
        let result = (|| {
            conn.execute_batch(SCHEMA)?;
            for (kind, n) in [("ad", taken.ads), ("tracker", taken.trackers)] {
                if n > 0 {
                    conn.execute(
                        "INSERT INTO block_kind_stats (day, kind, n) VALUES (?1, ?2, ?3)
                         ON CONFLICT(day, kind) DO UPDATE SET n = n + excluded.n",
                        params![day, kind, n as i64],
                    )?;
                }
            }
            Ok(())
        })();
        if result.is_err() {
            self.ads.fetch_add(taken.ads, Ordering::Relaxed);
            self.trackers.fetch_add(taken.trackers, Ordering::Relaxed);
        }
        result
    }

    /// Totales guardados más lo pendiente de volcar.
    pub fn snapshot(&self, conn: &Connection, day: &str) -> rusqlite::Result<BlockCounts> {
        conn.execute_batch(SCHEMA)?;
        let mut today = Kinds::default();
        let mut total = Kinds::default();
        let mut stmt = conn.prepare("SELECT day, kind, n FROM block_kind_stats")?;
        let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, i64>(2)?)))?;
        for row in rows {
            let (d, kind, n) = row?;
            let n = n.max(0) as u64;
            let k = if kind == "tracker" { Kinds { ads: 0, trackers: n } } else { Kinds { ads: n, trackers: 0 } };
            total.add(k);
            if d == day {
                today.add(k);
            }
        }
        let pending = self.pending();
        today.add(pending);
        total.add(pending);
        let first: Option<String> = conn.query_row("SELECT MIN(day) FROM block_kind_stats", [], |r| r.get(0)).optional()?.flatten();
        let since = first.or_else(|| (pending != Kinds::default()).then(|| day.to_owned()));
        Ok(BlockCounts { today, total, since })
    }

    /// Pone todo a cero (también lo pendiente).
    pub fn reset(&self, conn: &Connection) -> rusqlite::Result<()> {
        conn.execute_batch(SCHEMA)?;
        self.ads.store(0, Ordering::Relaxed);
        self.trackers.store(0, Ordering::Relaxed);
        conn.execute("DELETE FROM block_kind_stats", [])?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    fn db() -> Connection {
        Connection::open_in_memory().unwrap()
    }

    #[test]
    fn counts_by_kind_today_and_total_including_pending() {
        let (c, conn) = (KindCounter::new(), db());
        c.record(BlockKind::Ad);
        c.record(BlockKind::Ad);
        c.record(BlockKind::Tracker);
        c.flush(&conn, "2026-10-15").unwrap();
        c.record(BlockKind::Tracker);
        let s = c.snapshot(&conn, "2026-10-16").unwrap();
        assert_eq!(s.today, Kinds { ads: 0, trackers: 1 });
        assert_eq!(s.total, Kinds { ads: 2, trackers: 2 });
        assert_eq!(s.since.as_deref(), Some("2026-10-15"));
    }

    #[test]
    fn flush_accumulates_the_same_day_and_is_idempotent_when_empty() {
        let (c, conn) = (KindCounter::new(), db());
        c.record(BlockKind::Ad);
        c.flush(&conn, "2026-10-16").unwrap();
        c.flush(&conn, "2026-10-16").unwrap();
        c.record(BlockKind::Ad);
        c.flush(&conn, "2026-10-16").unwrap();
        assert_eq!(c.snapshot(&conn, "2026-10-16").unwrap().today.ads, 2);
    }

    #[test]
    fn empty_state_has_no_since() {
        let (c, conn) = (KindCounter::new(), db());
        let s = c.snapshot(&conn, "2026-10-16").unwrap();
        assert_eq!(s.total, Kinds::default());
        assert_eq!(s.since, None);
    }

    #[test]
    fn reset_clears_stored_and_pending() {
        let (c, conn) = (KindCounter::new(), db());
        c.record(BlockKind::Ad);
        c.flush(&conn, "2026-10-16").unwrap();
        c.record(BlockKind::Tracker);
        c.reset(&conn).unwrap();
        let s = c.snapshot(&conn, "2026-10-16").unwrap();
        assert_eq!(s.total, Kinds::default());
        assert_eq!(s.since, None);
    }

    #[test]
    fn concurrent_records_are_all_counted() {
        let c = Arc::new(KindCounter::new());
        let hs: Vec<_> = (0..8)
            .map(|i| {
                let c = c.clone();
                std::thread::spawn(move || {
                    for _ in 0..1000 {
                        c.record(if i % 2 == 0 { BlockKind::Ad } else { BlockKind::Tracker });
                    }
                })
            })
            .collect();
        for h in hs {
            h.join().unwrap();
        }
        let conn = db();
        c.flush(&conn, "2026-10-16").unwrap();
        let s = c.snapshot(&conn, "2026-10-16").unwrap();
        assert_eq!(s.total, Kinds { ads: 4000, trackers: 4000 });
    }
}
