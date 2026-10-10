use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::State;

use super::SystemState;
use crate::error::{CmdError, CmdResult};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadyInfo {
    pub pending_urls: Vec<String>,
    pub rolled_back_from: Option<String>,
}

/// Tiempo que debe pasar sin cuelgue para considerar la versión "sana" (§17).
const HEALTHY_AFTER: std::time::Duration = std::time::Duration::from_secs(20);

#[tauri::command]
pub async fn app_ready(sys: State<'_, Arc<SystemState>>) -> CmdResult<ReadyInfo> {
    let pending_urls = std::mem::take(&mut *sys.pending_urls.lock().expect("lock"));
    let rolled_back_from = {
        let mut g = sys.boot.lock().expect("lock");
        let n = g.take_rollback_notice();
        g.save().map_err(|e| CmdError::new("io", e.to_string()))?;
        n
    };
    let s = sys.inner().clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(HEALTHY_AFTER).await;
        let mut g = s.boot.lock().expect("lock");
        g.mark_healthy(&s.version);
        let _ = g.save();
    });
    Ok(ReadyInfo { pending_urls, rolled_back_from })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    pub version: String,
    pub os: String,
    pub arch: String,
    pub memory_mb: u64,
    pub webview2: Option<String>,
}

fn info(sys: &SystemState) -> SystemInfo {
    let mut s = sysinfo::System::new();
    s.refresh_memory();
    SystemInfo {
        version: sys.version.clone(),
        os: sysinfo::System::long_os_version().unwrap_or_else(|| std::env::consts::OS.into()),
        arch: std::env::consts::ARCH.into(),
        memory_mb: s.total_memory() / 1_048_576,
        webview2: tauri::webview_version().ok(),
    }
}

#[tauri::command]
pub async fn system_info(sys: State<'_, Arc<SystemState>>) -> CmdResult<SystemInfo> {
    Ok(info(&sys))
}

/// Solo datos técnicos: nunca URL ni contenido (decisión 14).
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrashReport {
    pub reason: String,
    pub exit_code: Option<i32>,
    pub tab_kind: String,
    pub at: i64,
}

#[tauri::command]
pub async fn crash_report_save(sys: State<'_, Arc<SystemState>>, report: CrashReport) -> CmdResult<String> {
    let dir = sys.data_dir.join("crash-reports");
    std::fs::create_dir_all(&dir).map_err(|e| CmdError::new("io", e.to_string()))?;
    let path = dir.join(format!("crash-{}.json", report.at));
    let body = serde_json::json!({ "report": report, "system": info(&sys) });
    std::fs::write(&path, serde_json::to_vec_pretty(&body).unwrap_or_default()).map_err(|e| CmdError::new("io", e.to_string()))?;
    Ok(path.display().to_string())
}
