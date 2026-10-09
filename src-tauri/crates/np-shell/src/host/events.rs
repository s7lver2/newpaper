use serde::Serialize;

use crate::{message::{PagePayload, ShortcutAction}, TabId};

pub const TABS_CHANGED: &str = "tabs://changed";
pub const TAB_PAGE: &str = "tab://page";
pub const TAB_SHORTCUT: &str = "tab://shortcut";
pub const TAB_TRANSITION: &str = "tab://transition";
pub const TAB_CONTEXT_MENU: &str = "tab://context-menu";

/// Contexto del clic derecho en una webview de contenido (el menú lo dibuja la UI).
#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ContextInfo {
    /// `page`, `image`, `selection`, `audio` o `video`.
    pub kind: &'static str,
    pub link: Option<String>,
    pub source: Option<String>,
    pub selection: Option<String>,
    pub editable: bool,
    pub page_url: String,
    /// Posición en la webview (px lógicos).
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TabContextMenuEvent {
    pub tab_id: TabId,
    #[serde(flatten)]
    pub info: ContextInfo,
    /// Captura de la página: la webview nativa se oculta mientras el menú está abierto.
    pub image: Option<String>,
}

/// Fases de la transición entre páginas que la UI dibuja: `start` (imagen de la página actual),
/// `ready` (imagen de la nueva: fundir) y `end` (quitar las imágenes).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TabTransitionEvent {
    pub tab_id: TabId,
    pub phase: &'static str,
    /// `data:image/png;base64,...` en `start` y `ready`.
    pub image: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TabPageEvent {
    pub tab_id: TabId,
    pub article: PagePayload,
    pub is_news: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TabShortcutEvent {
    pub tab_id: TabId,
    pub action: ShortcutAction,
}
