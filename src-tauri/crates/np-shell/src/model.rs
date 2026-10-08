//! Estado puro de las pestañas (sin Tauri).
use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::{input::is_internal, TabId};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TabKind {
    Web,
    Internal,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TabView {
    Original,
    Reader,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NavFailure {
    pub url: String,
    /// `COREWEBVIEW2_WEB_ERROR_STATUS` (0 si la navegación tuvo éxito con HTTP de error).
    pub web_error_status: i32,
    pub http_status: Option<u16>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TabInfo {
    pub id: TabId,
    pub url: String,
    pub title: String,
    pub kind: TabKind,
    pub private: bool,
    pub loading: bool,
    pub can_go_back: bool,
    pub can_go_forward: bool,
    pub view: TabView,
    pub is_news: bool,
    /// Readability extrajo un artículo: el lector se puede abrir a mano aunque no sea noticia.
    pub readable: bool,
    pub failure: Option<NavFailure>,
    pub crashed: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TabsSnapshot {
    pub tabs: Vec<TabInfo>,
    pub active_id: Option<TabId>,
}

fn kind_of(url: &str) -> TabKind {
    if is_internal(url) { TabKind::Internal } else { TabKind::Web }
}

#[derive(Debug, Default)]
pub struct TabList {
    tabs: Vec<TabInfo>,
    active: Option<TabId>,
    next_id: TabId,
    back_internal: HashMap<TabId, String>,
}

impl TabList {
    pub fn new() -> Self {
        Self { next_id: 1, ..Default::default() }
    }

    pub fn open(&mut self, url: &str, private: bool, activate: bool) -> TabId {
        let id = self.next_id;
        self.next_id += 1;
        self.tabs.push(TabInfo {
            id,
            url: url.to_string(),
            title: String::new(),
            kind: kind_of(url),
            private,
            loading: kind_of(url) == TabKind::Web,
            can_go_back: false,
            can_go_forward: false,
            view: TabView::Original,
            is_news: false,
            readable: false,
            failure: None,
            crashed: false,
        });
        if activate || self.active.is_none() {
            self.active = Some(id);
        }
        id
    }

    pub fn close(&mut self, id: TabId) -> Option<TabInfo> {
        let pos = self.tabs.iter().position(|t| t.id == id)?;
        let removed = self.tabs.remove(pos);
        self.back_internal.remove(&id);
        if self.active == Some(id) {
            self.active = self.tabs.get(pos).or_else(|| pos.checked_sub(1).and_then(|p| self.tabs.get(p))).map(|t| t.id);
        }
        Some(removed)
    }

    pub fn activate(&mut self, id: TabId) -> bool {
        if self.tabs.iter().any(|t| t.id == id) {
            self.active = Some(id);
            true
        } else {
            false
        }
    }

    pub fn get(&self, id: TabId) -> Option<&TabInfo> {
        self.tabs.iter().find(|t| t.id == id)
    }

    pub fn get_mut(&mut self, id: TabId) -> Option<&mut TabInfo> {
        self.tabs.iter_mut().find(|t| t.id == id)
    }

    pub fn active(&self) -> Option<TabId> {
        self.active
    }

    pub fn ids(&self) -> Vec<TabId> {
        self.tabs.iter().map(|t| t.id).collect()
    }

    /// Cambia la URL de la pestaña; si pasa de página interna a web, recuerda la interna para "Atrás".
    pub fn set_url(&mut self, id: TabId, url: &str) {
        let Some(tab) = self.tabs.iter_mut().find(|t| t.id == id) else { return };
        let new_kind = kind_of(url);
        if tab.kind == TabKind::Internal && new_kind == TabKind::Web {
            self.back_internal.insert(id, tab.url.clone());
        }
        if new_kind == TabKind::Internal {
            tab.title.clear();
            tab.is_news = false;
            tab.readable = false;
            tab.view = TabView::Original;
            tab.loading = false;
        }
        tab.url = url.to_string();
        tab.kind = new_kind;
        tab.failure = None;
        tab.crashed = false;
    }

    pub fn take_back_internal(&mut self, id: TabId) -> Option<String> {
        self.back_internal.remove(&id)
    }

    pub fn snapshot(&self) -> TabsSnapshot {
        TabsSnapshot { tabs: self.tabs.clone(), active_id: self.active }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn open_activate_and_close_pick_neighbour() {
        let mut l = TabList::new();
        let a = l.open("newpaper://inicio", false, true);
        let b = l.open("https://a.example/", false, true);
        let c = l.open("https://b.example/", false, false);
        assert_eq!(l.active(), Some(b));
        assert_eq!(l.get(a).unwrap().kind, TabKind::Internal);
        assert_eq!(l.get(b).unwrap().kind, TabKind::Web);
        l.close(b);
        assert_eq!(l.active(), Some(c), "closing the active tab activates the right neighbour");
        l.close(c);
        assert_eq!(l.active(), Some(a), "or the left one when it was the last");
        l.close(a);
        assert_eq!(l.active(), None);
        assert!(l.ids().is_empty());
    }

    #[test]
    fn ids_are_never_reused() {
        let mut l = TabList::new();
        let a = l.open("https://a.example/", false, true);
        l.close(a);
        assert_ne!(l.open("https://a.example/", false, true), a);
    }

    #[test]
    fn set_url_switches_kind_and_remembers_internal_origin() {
        let mut l = TabList::new();
        let t = l.open("newpaper://inicio", false, true);
        l.set_url(t, "https://a.example/");
        assert_eq!(l.get(t).unwrap().kind, TabKind::Web);
        assert_eq!(l.take_back_internal(t).as_deref(), Some("newpaper://inicio"));
        assert_eq!(l.take_back_internal(t), None);
    }

    #[test]
    fn snapshot_serializes_in_camel_case() {
        let mut l = TabList::new();
        l.open("https://a.example/", true, true);
        let v = serde_json::to_value(l.snapshot()).unwrap();
        assert_eq!(v["activeId"], 1);
        assert_eq!(v["tabs"][0]["kind"], "web");
        assert_eq!(v["tabs"][0]["private"], true);
        assert_eq!(v["tabs"][0]["view"], "original");
        assert_eq!(v["tabs"][0]["canGoBack"], false);
        assert!(v["tabs"][0]["failure"].is_null());
    }
}
