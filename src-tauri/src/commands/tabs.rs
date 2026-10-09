use std::sync::Arc;

use np_shell::{
    host::{INK_BG, PAPER_BG},
    model::{TabInfo, TabView, TabsSnapshot},
    Rect, TabId, TabManager,
};
use tauri::State;

use crate::error::CmdResult;

type Tabs<'a> = State<'a, Arc<TabManager>>;

// Todos `async`: crear webviews en comandos síncronos bloquea en Windows.
#[tauri::command]
pub async fn tab_open(tabs: Tabs<'_>, url: Option<String>, private: Option<bool>, activate: Option<bool>) -> CmdResult<TabInfo> {
    Ok(tabs.open(url, private.unwrap_or(false), activate.unwrap_or(true)).await?)
}

#[tauri::command]
pub async fn tab_close(tabs: Tabs<'_>, tab_id: TabId) -> CmdResult<()> {
    Ok(tabs.close(tab_id).await?)
}

#[tauri::command]
pub async fn tab_activate(tabs: Tabs<'_>, tab_id: TabId) -> CmdResult<()> {
    Ok(tabs.activate(tab_id).await?)
}

#[tauri::command]
pub async fn tab_navigate(tabs: Tabs<'_>, tab_id: TabId, input: String) -> CmdResult<()> {
    Ok(tabs.navigate(tab_id, &input).await?)
}

#[tauri::command]
pub async fn tab_back(tabs: Tabs<'_>, tab_id: TabId) -> CmdResult<()> {
    Ok(tabs.back(tab_id).await?)
}

#[tauri::command]
pub async fn tab_forward(tabs: Tabs<'_>, tab_id: TabId) -> CmdResult<()> {
    Ok(tabs.forward(tab_id).await?)
}

#[tauri::command]
pub async fn tab_reload(tabs: Tabs<'_>, tab_id: TabId) -> CmdResult<()> {
    Ok(tabs.reload(tab_id).await?)
}

#[tauri::command]
pub async fn tab_set_view(tabs: Tabs<'_>, tab_id: TabId, view: TabView) -> CmdResult<()> {
    Ok(tabs.set_view(tab_id, view)?)
}

#[tauri::command]
pub async fn tab_set_bounds(tabs: Tabs<'_>, rect: Rect) -> CmdResult<()> {
    tabs.set_bounds(rect);
    Ok(())
}

/// La UI informa del tema resuelto (`paper` / `ink`) para pintar el fondo nativo de ventana y webviews.
#[tauri::command]
pub async fn chrome_set_theme(tabs: Tabs<'_>, theme: String) -> CmdResult<()> {
    tabs.set_background(if theme == "ink" { INK_BG } else { PAPER_BG });
    Ok(())
}

#[tauri::command]
pub async fn tabs_snapshot(tabs: Tabs<'_>) -> CmdResult<TabsSnapshot> {
    Ok(tabs.snapshot())
}
