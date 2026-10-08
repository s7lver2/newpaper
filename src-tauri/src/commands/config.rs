use tauri::AppHandle;

use crate::error::CmdResult;

#[tauri::command]
pub async fn config_read(app: AppHandle, name: String) -> CmdResult<String> {
    crate::config::read_config_text(&app, &name)
}
