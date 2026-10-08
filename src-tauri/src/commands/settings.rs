use std::sync::Arc;

use np_store::Store;
use serde_json::Value;
use tauri::State;

use crate::error::CmdResult;

#[tauri::command]
pub async fn settings_get(store: State<'_, Arc<Store>>, key: String) -> CmdResult<Option<Value>> {
    Ok(store.get_setting::<Value>(&key)?)
}

#[tauri::command]
pub async fn settings_set(store: State<'_, Arc<Store>>, key: String, value: Value) -> CmdResult<()> {
    Ok(store.set_setting(&key, &value)?)
}

#[tauri::command]
pub async fn settings_list(store: State<'_, Arc<Store>>, prefix: String) -> CmdResult<Vec<(String, Value)>> {
    Ok(store.list_settings(&prefix)?)
}
