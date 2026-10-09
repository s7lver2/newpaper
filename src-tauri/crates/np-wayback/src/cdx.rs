//! API CDX del Internet Archive y descarga de capturas crudas (`id_`).
use serde::{Deserialize, Serialize};

use crate::{Result, WaybackError};

pub const BASE: &str = "https://web.archive.org";
pub const MAX_CAPTURES: usize = 12;
pub const CDX_TTL_SECS: i64 = 6 * 3600;
const MAX_CAPTURE_BYTES: usize = 8 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CdxRow {
    /// YYYYMMDDhhmmss (UTC).
    pub timestamp: String,
    pub digest: String,
    pub status: u16,
}

pub fn cdx_url(base: &str, url: &str) -> String {
    let encoded: String = url::form_urlencoded::byte_serialize(url.as_bytes()).collect();
    format!("{base}/cdx/search/cdx?url={encoded}&output=json&fl=timestamp,digest,statuscode&filter=statuscode:200&collapse=digest")
}

pub fn capture_url(base: &str, ts: &str, url: &str) -> String {
    format!("{base}/web/{ts}id_/{url}")
}

pub fn parse_cdx(json: &str) -> Result<Vec<CdxRow>> {
    if json.trim().is_empty() {
        return Ok(vec![]);
    }
    let rows: Vec<Vec<String>> = serde_json::from_str(json)?;
    Ok(rows
        .into_iter()
        .skip(1)
        .filter_map(|r| Some(CdxRow { timestamp: r.first()?.clone(), digest: r.get(1)?.clone(), status: r.get(2)?.parse().ok()? }))
        .collect())
}

/// Hasta `max` capturas con digest distinto: la primera, la última y el resto repartidas en el tiempo.
pub fn pick_captures(rows: &[CdxRow], max: usize) -> Vec<CdxRow> {
    let mut unique: Vec<&CdxRow> = Vec::new();
    for r in rows {
        if !unique.iter().any(|u| u.digest == r.digest) {
            unique.push(r);
        }
    }
    if unique.len() <= max {
        return unique.into_iter().cloned().collect();
    }
    let last = unique.len() - 1;
    let mut idx: Vec<usize> = (0..max).map(|i| (i * last + (max - 1) / 2) / (max - 1)).collect();
    idx.dedup();
    idx.into_iter().map(|i| unique[i].clone()).collect()
}

pub async fn fetch_cdx(client: &reqwest::Client, base: &str, url: &str) -> Result<Vec<CdxRow>> {
    let resp = client.get(cdx_url(base, url)).send().await?;
    if !resp.status().is_success() {
        return Err(WaybackError::Status(resp.status().as_u16()));
    }
    parse_cdx(&resp.text().await?)
}

pub async fn fetch_capture(client: &reqwest::Client, base: &str, ts: &str, url: &str) -> Result<String> {
    let resp = client.get(capture_url(base, ts, url)).send().await?;
    if !resp.status().is_success() {
        return Err(WaybackError::Status(resp.status().as_u16()));
    }
    let body = resp.text().await?;
    if body.len() > MAX_CAPTURE_BYTES {
        return Err(WaybackError::TooLarge);
    }
    Ok(body)
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_spec_urls() {
        assert_eq!(
            cdx_url(BASE, "https://elpais.com/a?b=1"),
            "https://web.archive.org/cdx/search/cdx?url=https%3A%2F%2Felpais.com%2Fa%3Fb%3D1&output=json&fl=timestamp,digest,statuscode&filter=statuscode:200&collapse=digest"
        );
        assert_eq!(capture_url(BASE, "20261006060000", "https://elpais.com/a"), "https://web.archive.org/web/20261006060000id_/https://elpais.com/a");
    }

    #[test]
    fn parses_cdx_json_skipping_header_and_empty_results() {
        let rows = parse_cdx(include_str!("../tests/fixtures/cdx.json")).unwrap();
        assert_eq!(rows.len(), 3);
        assert_eq!(rows[1], CdxRow { timestamp: "20261006090000".into(), digest: "BBB".into(), status: 200 });
        assert!(parse_cdx("[]").unwrap().is_empty());
        assert!(parse_cdx("").unwrap().is_empty());
    }

    #[test]
    fn picks_at_most_twelve_keeping_first_last_and_unique_digests() {
        let rows: Vec<CdxRow> = (0..30).map(|i| CdxRow { timestamp: format!("2026100600{:04}", i), digest: format!("D{}", i % 25), status: 200 }).collect();
        let p = pick_captures(&rows, MAX_CAPTURES);
        assert_eq!(p.len(), 12);
        assert_eq!(p.first().unwrap().timestamp, rows[0].timestamp);
        let mut digests: Vec<&str> = p.iter().map(|r| r.digest.as_str()).collect();
        digests.dedup();
        assert_eq!(digests.len(), 12);
        assert_eq!(pick_captures(&rows[..3], 12).len(), 3);
    }
}
