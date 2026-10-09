//! Caché de CDX (6 h) y texto extraído de cada captura.
use rusqlite::{params, Connection, OptionalExtension};

use crate::{
    cdx::{CdxRow, CDX_TTL_SECS},
    Result,
};

pub fn cached_cdx(conn: &Connection, url: &str, now: i64) -> Result<Option<Vec<CdxRow>>> {
    let row: Option<(String, i64)> = conn
        .query_row("SELECT json, fetched_at FROM wayback_cdx WHERE url = ?1", [url], |r| Ok((r.get(0)?, r.get(1)?)))
        .optional()?;
    match row {
        Some((json, at)) if now - at < CDX_TTL_SECS => Ok(Some(serde_json::from_str(&json)?)),
        _ => Ok(None),
    }
}

pub fn store_cdx(conn: &Connection, url: &str, rows: &[CdxRow], now: i64) -> Result<()> {
    conn.execute(
        "INSERT INTO wayback_cdx(url, json, fetched_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(url) DO UPDATE SET json = excluded.json, fetched_at = excluded.fetched_at",
        params![url, serde_json::to_string(rows)?, now],
    )?;
    Ok(())
}

pub fn store_extracted(conn: &Connection, url: &str, ts: &str, digest: &str, json: &str, now: i64) -> Result<()> {
    conn.execute(
        "INSERT INTO wayback_captures(url, timestamp, digest, extracted_json, fetched_at) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(url, timestamp) DO UPDATE SET extracted_json = excluded.extracted_json, fetched_at = excluded.fetched_at",
        params![url, ts, digest, json, now],
    )?;
    Ok(())
}

/// (timestamp, digest, extracted_json) en orden cronológico.
pub fn load_extracted(conn: &Connection, url: &str) -> Result<Vec<(String, String, String)>> {
    let mut st = conn.prepare("SELECT timestamp, digest, extracted_json FROM wayback_captures WHERE url = ?1 AND extracted_json IS NOT NULL ORDER BY timestamp")?;
    let rows = st.query_map([url], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}
