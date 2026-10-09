use std::sync::Arc;

use np_shell::{
    host::{INK_BG, PAPER_BG},
    model::{GroupId, TabInfo, TabView, TabsSnapshot},
    Rect, TabId, TabManager,
};
use tauri::State;

use crate::error::CmdResult;

type Tabs<'a> = State<'a, Arc<TabManager>>;

// Todos `async`: crear webviews en comandos síncronos bloquea en Windows.
#[tauri::command]
pub async fn tab_open(tabs: Tabs<'_>, url: Option<String>, private: Option<bool>, activate: Option<bool>, opener_id: Option<TabId>) -> CmdResult<TabInfo> {
    Ok(tabs.open_from(url, private.unwrap_or(false), activate.unwrap_or(true), opener_id).await?)
}

/// Ancla o desancla una pestaña.
#[tauri::command]
pub async fn tab_pin(tabs: Tabs<'_>, tab_id: TabId, pinned: bool) -> CmdResult<()> {
    tabs.pin(tab_id, pinned);
    Ok(())
}

/// Agrupa pestañas (nuevo grupo) o añade una a un grupo existente (`group_id`).
#[tauri::command]
pub async fn tab_group(tabs: Tabs<'_>, tab_ids: Vec<TabId>, name: Option<String>, group_id: Option<GroupId>) -> CmdResult<Option<GroupId>> {
    match group_id {
        Some(g) => {
            for id in &tab_ids {
                tabs.add_to_group(*id, g);
            }
            Ok(Some(g))
        }
        None => Ok(tabs.group_tabs(&tab_ids, name)),
    }
}

#[tauri::command]
pub async fn tab_ungroup(tabs: Tabs<'_>, tab_id: TabId) -> CmdResult<()> {
    tabs.ungroup(tab_id);
    Ok(())
}

#[tauri::command]
pub async fn tab_group_update(tabs: Tabs<'_>, group_id: GroupId, name: Option<String>, color: Option<String>, collapsed: Option<bool>) -> CmdResult<()> {
    tabs.update_group(group_id, name, color, collapsed);
    Ok(())
}

#[tauri::command]
pub async fn tab_close_group(tabs: Tabs<'_>, group_id: GroupId) -> CmdResult<()> {
    Ok(tabs.close_group(group_id).await?)
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

/// El menú contextual de una pestaña se cerró: la webview vuelve a la vista.
#[tauri::command]
pub async fn ctx_close(tabs: Tabs<'_>, tab_id: TabId) -> CmdResult<()> {
    tabs.ctx_close(tab_id);
    Ok(())
}

/// Un popover de la UI va a abrirse sobre la página: devuelve una captura y oculta la webview nativa.
#[tauri::command]
pub async fn overlay_open(tabs: Tabs<'_>, tab_id: TabId) -> CmdResult<Option<String>> {
    Ok(tabs.overlay_open(tab_id).await)
}

/// Corta/pega/selecciona en el campo enfocado de la página (acciones del menú contextual).
#[tauri::command]
pub async fn ctx_edit(tabs: Tabs<'_>, tab_id: TabId, action: String, text: Option<String>) -> CmdResult<()> {
    Ok(tabs.ctx_edit(tab_id, &action, text.as_deref())?)
}

/// Texto del portapapeles del sistema (para pegar sin el permiso de portapapeles del navegador).
#[tauri::command]
pub async fn clipboard_text() -> CmdResult<Option<String>> {
    #[cfg(windows)]
    {
        Ok(np_shell::host::clipboard_text())
    }
    #[cfg(not(windows))]
    {
        Ok(None)
    }
}

/// La UI informa de `prefers-reduced-motion`: sin transición entre páginas.
#[tauri::command]
pub async fn chrome_set_motion(tabs: Tabs<'_>, reduced: bool) -> CmdResult<()> {
    tabs.set_reduced_motion(reduced);
    Ok(())
}

#[tauri::command]
pub async fn tabs_snapshot(tabs: Tabs<'_>) -> CmdResult<TabsSnapshot> {
    Ok(tabs.snapshot())
}
