use std::{sync::Arc, time::Duration};

use np_shell::extensions::{HttpPurpose, ShellExtensions};
use np_store::Store;
use np_update::{
    channels::CONTENT_MANIFEST_URL,
    content::{parse_verified, ContentDir},
    repo::{self, ContentUpdate},
};
use serde::Serialize;
use tauri::{App, AppHandle, Emitter, Manager, State};

use crate::error::{CmdError, CmdResult};

pub const CONTENT_PUBKEY: &str = include_str!("../../../keys/content.pub");
const MAX_RESOURCE: usize = 20 * 1024 * 1024;

#[derive(Default)]
pub struct ContentState {
    pub last_check: std::sync::Mutex<Option<i64>>,
    pub last_error: std::sync::Mutex<Option<String>>,
    pub running: tokio::sync::Mutex<()>,
}

fn dir(app: &AppHandle) -> Result<ContentDir, String> {
    Ok(ContentDir::new(&app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("content")))
}

async fn fetch(client: &reqwest::Client, url: &str) -> Result<Vec<u8>, String> {
    let r = client.get(url).send().await.map_err(|e| e.to_string())?.error_for_status().map_err(|e| e.to_string())?;
    let b = r.bytes().await.map_err(|e| e.to_string())?;
    if b.len() > MAX_RESOURCE {
        return Err(format!("resource too large: {url}"));
    }
    Ok(b.to_vec())
}

pub async fn check_now(app: &AppHandle) -> Result<Vec<String>, String> {
    let st = app.state::<Arc<ContentState>>().inner().clone();
    let _g = st.running.lock().await;
    let client = app.state::<Arc<ShellExtensions>>().http_client(HttpPurpose::Updates)?;
    let result: Result<Vec<String>, String> = async {
        let manifest_bytes = fetch(&client, CONTENT_MANIFEST_URL).await?;
        let sig = String::from_utf8(fetch(&client, &format!("{CONTENT_MANIFEST_URL}.minisig")).await?).map_err(|e| e.to_string())?;
        let manifest = parse_verified(CONTENT_PUBKEY, &manifest_bytes, &sig).map_err(|e| e.to_string())?;
        let cd = dir(app)?;
        if cd.current_manifest().is_some_and(|m| m.version >= manifest.version) {
            return Ok(vec![]);
        }
        let mut fetched = Vec::new();
        for r in cd.plan(&manifest) {
            fetched.push((r.name.clone(), fetch(&client, &r.url).await?));
        }
        let names: Vec<String> = fetched.iter().map(|(n, _)| n.clone()).collect();
        let staging = cd.stage(&manifest, &fetched).map_err(|e| e.to_string())?;
        cd.commit(&staging).map_err(|e| e.to_string())?;
        let store = app.state::<Arc<Store>>();
        let _ = repo::record(&store, &ContentUpdate { manifest_version: manifest.version, applied_at: chrono::Utc::now().timestamp_millis(), action: "apply".into(), resources: names.clone() });
        let _ = app.emit_to("ui", "content://applied", serde_json::json!({ "version": manifest.version, "resources": names }));
        Ok(names)
    }
    .await;
    *st.last_check.lock().expect("lock") = Some(chrono::Utc::now().timestamp_millis());
    *st.last_error.lock().expect("lock") = result.as_ref().err().cloned();
    result
}

pub fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    app.manage(Arc::new(ContentState::default()));
    let handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(60)).await;
        loop {
            if let Err(e) = check_now(&handle).await {
                tracing::info!(error = %e, "content update check failed");
            }
            tokio::time::sleep(Duration::from_secs(24 * 3600)).await;
        }
    });
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentStatus {
    pub version: Option<u32>,
    pub history: Vec<ContentUpdate>,
    pub last_check: Option<i64>,
    pub last_error: Option<String>,
}

#[tauri::command]
pub async fn content_status(app: AppHandle, st: State<'_, Arc<ContentState>>, store: State<'_, Arc<Store>>) -> CmdResult<ContentStatus> {
    let cd = dir(&app).map_err(|e| CmdError::new("io", e))?;
    Ok(ContentStatus {
        version: cd.current_manifest().map(|m| m.version),
        history: repo::history(&store, 20).map_err(|e| CmdError::new("sql", e.to_string()))?,
        last_check: *st.last_check.lock().expect("lock"),
        last_error: st.last_error.lock().expect("lock").clone(),
    })
}

#[tauri::command]
pub async fn content_check_now(app: AppHandle) -> CmdResult<Vec<String>> {
    check_now(&app).await.map_err(|e| CmdError::new("content", e))
}

#[tauri::command]
pub async fn content_revert(app: AppHandle, store: State<'_, Arc<Store>>) -> CmdResult<()> {
    let cd = dir(&app).map_err(|e| CmdError::new("io", e))?;
    cd.revert().map_err(|e| CmdError::new("content", e.to_string()))?;
    let version = cd.current_manifest().map(|m| m.version).unwrap_or(0);
    let _ = repo::record(&store, &ContentUpdate { manifest_version: version, applied_at: chrono::Utc::now().timestamp_millis(), action: "revert".into(), resources: vec![] });
    let _ = app.emit_to("ui", "content://applied", serde_json::json!({ "version": version, "resources": [] }));
    Ok(())
}
