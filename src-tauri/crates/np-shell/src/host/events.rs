use serde::Serialize;

use crate::{message::{PagePayload, ShortcutAction}, TabId};

pub const TABS_CHANGED: &str = "tabs://changed";
pub const TAB_PAGE: &str = "tab://page";
pub const TAB_SHORTCUT: &str = "tab://shortcut";

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
