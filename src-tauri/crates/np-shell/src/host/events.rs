use serde::Serialize;

use crate::{message::{PagePayload, ShortcutAction}, TabId};

pub const TABS_CHANGED: &str = "tabs://changed";
pub const TAB_PAGE: &str = "tab://page";
pub const TAB_SHORTCUT: &str = "tab://shortcut";
pub const TAB_TRANSITION: &str = "tab://transition";

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
