use std::sync::Arc;

use np_feeds::text::Lang;
use np_shell::extensions::{HttpPurpose, ShellExtensions};
use np_store::Store;
use np_wayback::{
    cdx::{fetch_capture, fetch_cdx, pick_captures, CdxRow, BASE, MAX_CAPTURES},
    editions::{analyze, diff_texts, CaptureInput, CaptureText, TextDiff, WaybackHistory},
    repo::{cached_cdx, store_cdx, store_extracted},
};
use tauri::State;

use super::content_locale;
use crate::error::{CmdError, CmdResult};

fn we(e: np_wayback::WaybackError) -> CmdError {
    CmdError::new("wayback", e.to_string())
}

fn client(ext: &ShellExtensions) -> CmdResult<reqwest::Client> {
    ext.http_client(HttpPurpose::Archive).map_err(|e| CmdError::new("network", e))
}

fn wrap<E: std::error::Error + Send + Sync + 'static>(e: E) -> rusqlite::Error {
    rusqlite::Error::ToSqlConversionFailure(Box::new(e))
}

#[tauri::command]
pub async fn wayback_captures(store: State<'_, Arc<Store>>, ext: State<'_, Arc<ShellExtensions>>, url: String) -> CmdResult<Vec<CdxRow>> {
    let now = chrono::Utc::now().timestamp();
    if let Some(rows) = store.with_conn(|c| cached_cdx(c, &url, now).map_err(wrap))? {
        return Ok(pick_captures(&rows, MAX_CAPTURES));
    }
    let rows = fetch_cdx(&client(&ext)?, BASE, &url).await.map_err(we)?;
    store.with_conn(|c| store_cdx(c, &url, &rows, now).map_err(wrap))?;
    Ok(pick_captures(&rows, MAX_CAPTURES))
}

#[tauri::command]
pub async fn wayback_capture_html(ext: State<'_, Arc<ShellExtensions>>, url: String, timestamp: String) -> CmdResult<String> {
    if timestamp.len() != 14 || !timestamp.chars().all(|c| c.is_ascii_digit()) {
        return Err(CmdError::new("wayback", "invalid timestamp"));
    }
    fetch_capture(&client(&ext)?, BASE, &timestamp, &url).await.map_err(we)
}

#[tauri::command]
pub async fn wayback_analyze(store: State<'_, Arc<Store>>, url: String, captures: Vec<CaptureInput>) -> CmdResult<WaybackHistory> {
    let now = chrono::Utc::now().timestamp();
    for c in &captures {
        let json = serde_json::to_string(&c.text).map_err(|e| CmdError::new("wayback", e.to_string()))?;
        store.with_conn(|conn| store_extracted(conn, &url, &c.timestamp, &c.digest, &json, now).map_err(wrap))?;
    }
    Ok(analyze(&url, captures, Lang::from_code(&content_locale(&store))))
}

#[tauri::command]
pub async fn wayback_diff(a: CaptureText, b: CaptureText) -> CmdResult<TextDiff> {
    Ok(diff_texts(&a, &b))
}
