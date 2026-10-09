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

pub type GroupId = u64;

/// Colores de grupo (nombres de token; la UI los mapea a `--np-group-*`), en el orden en que se reparten.
pub const GROUP_COLORS: [&str; 6] = ["blue", "green", "amber", "rose", "violet", "teal"];

/// Grupo de pestañas con nombre y color, plegable.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TabGroup {
    pub id: GroupId,
    pub name: String,
    pub color: String,
    pub collapsed: bool,
}

/// Dominio registrable aproximado (`www.elpais.com` -> `elpais.com`, `www.bbc.co.uk` -> `bbc.co.uk`).
pub fn site_of(url: &str) -> Option<String> {
    let host = url::Url::parse(url).ok()?.host_str()?.to_ascii_lowercase();
    let host = host.strip_prefix("www.").unwrap_or(&host).to_string();
    let labels: Vec<&str> = host.split('.').collect();
    if labels.len() <= 2 || host.parse::<std::net::IpAddr>().is_ok() {
        return Some(host);
    }
    let last = labels[labels.len() - 1];
    let second = labels[labels.len() - 2];
    let take = if last.len() == 2 && matches!(second, "co" | "com" | "org" | "net" | "gov" | "ac" | "edu") { 3 } else { 2 };
    Some(labels[labels.len() - take..].join("."))
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
    /// Se espera a saber si la página abre el lector: la webview sigue oculta y la UI muestra su carga.
    pub reader_pending: bool,
    pub failure: Option<NavFailure>,
    pub crashed: bool,
    /// Anclada: va al principio, sin grupo.
    pub pinned: bool,
    pub group: Option<GroupId>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TabsSnapshot {
    pub tabs: Vec<TabInfo>,
    pub active_id: Option<TabId>,
    pub groups: Vec<TabGroup>,
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
    groups: Vec<TabGroup>,
    next_group: GroupId,
}

impl TabList {
    pub fn new() -> Self {
        Self { next_id: 1, next_group: 1, ..Default::default() }
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
            reader_pending: false,
            failure: None,
            crashed: false,
            pinned: false,
            group: None,
        });
        if activate || self.active.is_none() {
            self.active = Some(id);
        }
        id
    }

    /// Abre una pestaña desde otra (`opener`): queda justo detrás de ella (o al final de su grupo) y se une a
    /// su grupo; si es del mismo sitio y no había grupo, se crea uno con el nombre del sitio.
    pub fn open_from(&mut self, url: &str, private: bool, activate: bool, opener: Option<TabId>) -> TabId {
        let id = self.open(url, private, activate);
        let Some(op) = opener.filter(|o| *o != id && self.get(*o).is_some()) else { return id };
        let (op_group, op_url, op_pinned) = {
            let o = self.get(op).expect("opener exists");
            (o.group, o.url.clone(), o.pinned)
        };
        if op_pinned {
            // Detrás de las ancladas, sin grupo.
            self.move_to(id, self.pinned_count());
            return id;
        }
        let same_site = site_of(url).is_some() && site_of(url) == site_of(&op_url);
        match op_group {
            Some(g) => {
                self.set_group_of(id, Some(g));
                self.move_after_group(id, g);
            }
            None if same_site => {
                let name = site_of(url).unwrap_or_default();
                if let Some(g) = self.group(&[op, id], Some(name)) {
                    self.move_after_group(id, g);
                }
            }
            None => {
                let pos = self.index_of(op).map_or(self.tabs.len(), |i| i + 1);
                self.move_to(id, pos);
            }
        }
        id
    }

    fn index_of(&self, id: TabId) -> Option<usize> {
        self.tabs.iter().position(|t| t.id == id)
    }

    fn pinned_count(&self) -> usize {
        self.tabs.iter().take_while(|t| t.pinned).count()
    }

    /// Mueve la pestaña a la posición `pos` (índice final).
    fn move_to(&mut self, id: TabId, pos: usize) {
        let Some(from) = self.index_of(id) else { return };
        let tab = self.tabs.remove(from);
        let pos = pos.min(self.tabs.len());
        self.tabs.insert(pos, tab);
    }

    fn move_after_group(&mut self, id: TabId, g: GroupId) {
        let last = self.tabs.iter().rposition(|t| t.group == Some(g) && t.id != id);
        if let Some(i) = last {
            let from = self.index_of(id).unwrap_or(0);
            let target = if from > i { i + 1 } else { i };
            self.move_to(id, target);
        }
    }

    fn set_group_of(&mut self, id: TabId, g: Option<GroupId>) {
        if let Some(t) = self.get_mut(id) {
            t.group = g;
        }
        self.drop_empty_groups();
    }

    fn drop_empty_groups(&mut self) {
        let used: Vec<GroupId> = self.tabs.iter().filter_map(|t| t.group).collect();
        self.groups.retain(|g| used.contains(&g.id));
    }

    /// Ancla o desancla. Las ancladas van juntas al principio y no pertenecen a ningún grupo.
    pub fn set_pinned(&mut self, id: TabId, on: bool) {
        let Some(t) = self.get_mut(id) else { return };
        if t.pinned == on {
            return;
        }
        t.pinned = on;
        if on {
            t.group = None;
        }
        // Anclada: al final del bloque de ancladas; desanclada: justo tras él.
        let pinned_before = self.tabs.iter().filter(|t| t.pinned && t.id != id).count();
        self.move_to(id, pinned_before);
        self.drop_empty_groups();
    }

    /// Agrupa `ids` (contiguas, en la posición de la primera). Devuelve el grupo, o `None` si no hay pestañas válidas.
    pub fn group(&mut self, ids: &[TabId], name: Option<String>) -> Option<GroupId> {
        let members: Vec<TabId> = self.tabs.iter().filter(|t| ids.contains(&t.id) && !t.pinned).map(|t| t.id).collect();
        let first = *members.first()?;
        let id = self.next_group;
        self.next_group += 1;
        let color = GROUP_COLORS[(id as usize - 1) % GROUP_COLORS.len()].to_string();
        let name = name
            .map(|n| n.trim().to_string())
            .filter(|n| !n.is_empty())
            .or_else(|| self.get(first).and_then(|t| site_of(&t.url)))
            .unwrap_or_else(|| format!("Grupo {id}"));
        let at = self.index_of(first).unwrap_or(0);
        for m in &members {
            if let Some(t) = self.get_mut(*m) {
                t.group = Some(id);
            }
        }
        // Contiguas: se colocan una tras otra desde la posición de la primera.
        for (k, m) in members.iter().enumerate() {
            self.move_to(*m, at + k);
        }
        self.groups.push(TabGroup { id, name: name.chars().take(40).collect(), color, collapsed: false });
        self.drop_empty_groups();
        Some(id)
    }

    pub fn add_to_group(&mut self, id: TabId, g: GroupId) -> bool {
        if !self.groups.iter().any(|x| x.id == g) || self.get(id).is_none_or(|t| t.pinned) {
            return false;
        }
        self.set_group_of(id, Some(g));
        self.move_after_group(id, g);
        true
    }

    pub fn ungroup(&mut self, id: TabId) {
        if self.get(id).is_some_and(|t| t.group.is_some()) {
            self.set_group_of(id, None);
        }
    }

    pub fn update_group(&mut self, g: GroupId, name: Option<String>, color: Option<String>, collapsed: Option<bool>) {
        let Some(grp) = self.groups.iter_mut().find(|x| x.id == g) else { return };
        if let Some(n) = name.map(|n| n.trim().to_string()).filter(|n| !n.is_empty()) {
            grp.name = n.chars().take(40).collect();
        }
        if let Some(c) = color.filter(|c| GROUP_COLORS.contains(&c.as_str())) {
            grp.color = c;
        }
        if let Some(c) = collapsed {
            grp.collapsed = c;
        }
    }

    /// Ids de las pestañas de un grupo (para cerrarlas).
    pub fn tabs_of_group(&self, g: GroupId) -> Vec<TabId> {
        self.tabs.iter().filter(|t| t.group == Some(g)).map(|t| t.id).collect()
    }

    pub fn close(&mut self, id: TabId) -> Option<TabInfo> {
        let pos = self.tabs.iter().position(|t| t.id == id)?;
        let removed = self.tabs.remove(pos);
        self.back_internal.remove(&id);
        self.drop_empty_groups();
        if self.active == Some(id) {
            self.active = self.tabs.get(pos).or_else(|| pos.checked_sub(1).and_then(|p| self.tabs.get(p))).map(|t| t.id);
        }
        Some(removed)
    }

    pub fn activate(&mut self, id: TabId) -> bool {
        if let Some(g) = self.get(id).and_then(|t| t.group) {
            // Una pestaña activa nunca queda escondida en un grupo plegado.
            self.update_group(g, None, None, Some(false));
        }
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
        TabsSnapshot { tabs: self.tabs.clone(), active_id: self.active, groups: self.groups.clone() }
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

    fn order(l: &TabList) -> Vec<TabId> {
        l.ids()
    }

    #[test]
    fn site_of_strips_www_and_keeps_two_level_suffixes() {
        assert_eq!(site_of("https://www.elpais.com/x").as_deref(), Some("elpais.com"));
        assert_eq!(site_of("https://static.elpais.com/").as_deref(), Some("elpais.com"));
        assert_eq!(site_of("https://www.bbc.co.uk/news").as_deref(), Some("bbc.co.uk"));
        assert_eq!(site_of("http://127.0.0.1:4570/a").as_deref(), Some("127.0.0.1"));
    }

    #[test]
    fn opening_from_a_tab_of_the_same_site_creates_a_named_group_next_to_it() {
        let mut l = TabList::new();
        let a = l.open("https://elpais.com/", false, true);
        let z = l.open("https://otro.example/", false, false);
        let b = l.open_from("https://elpais.com/espana/x.html", false, true, Some(a));
        assert_eq!(order(&l), vec![a, b, z]);
        let g = l.get(a).unwrap().group.expect("grouped");
        assert_eq!(l.get(b).unwrap().group, Some(g));
        assert_eq!(l.snapshot().groups[0].name, "elpais.com");
        // una tercera del mismo sitio se une al grupo, detrás de la última
        let c = l.open_from("https://elpais.com/y.html", false, true, Some(a));
        assert_eq!(order(&l), vec![a, b, c, z]);
        assert_eq!(l.get(c).unwrap().group, Some(g));
    }

    #[test]
    fn opening_from_another_site_stays_ungrouped_but_adjacent() {
        let mut l = TabList::new();
        let a = l.open("https://a.example/", false, true);
        let z = l.open("https://z.example/", false, false);
        let b = l.open_from("https://b.example/", false, true, Some(a));
        assert_eq!(order(&l), vec![a, b, z]);
        assert!(l.get(b).unwrap().group.is_none() && l.snapshot().groups.is_empty());
    }

    #[test]
    fn manual_grouping_collapses_pins_and_closing_clean_up() {
        let mut l = TabList::new();
        let t: Vec<TabId> = (0..5).map(|i| l.open(&format!("https://s{i}.example/"), false, i == 0)).collect();
        let g = l.group(&[t[1], t[3]], Some("Lectura".into())).unwrap();
        assert_eq!(order(&l), vec![t[0], t[1], t[3], t[2], t[4]], "members become contiguous");
        l.update_group(g, None, Some("rose".into()), Some(true));
        assert!(l.snapshot().groups[0].collapsed);
        assert_eq!(l.snapshot().groups[0].color, "rose");
        assert!(l.activate(t[3]));
        assert!(!l.snapshot().groups[0].collapsed, "activating a tab expands its group");
        // anclar saca del grupo y manda la pestaña al principio
        l.set_pinned(t[1], true);
        assert_eq!(order(&l)[0], t[1]);
        assert_eq!(l.get(t[1]).unwrap().group, None);
        // un grupo con una sola pestaña sigue existiendo; vacío desaparece
        l.close(t[3]);
        assert!(l.snapshot().groups.is_empty());
        // agrupar anclada no hace nada
        assert!(l.group(&[t[1]], None).is_none());
    }

    #[test]
    fn closing_a_group_lists_its_tabs() {
        let mut l = TabList::new();
        let a = l.open("https://a.example/", false, true);
        let b = l.open("https://b.example/", false, false);
        l.open("https://c.example/", false, false);
        let g = l.group(&[a, b], None).unwrap();
        assert_eq!(l.tabs_of_group(g), vec![a, b]);
        l.ungroup(a);
        assert_eq!(l.tabs_of_group(g), vec![b]);
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
        assert_eq!(v["tabs"][0]["pinned"], false);
        assert!(v["tabs"][0]["group"].is_null());
        assert!(v["groups"].as_array().unwrap().is_empty());
    }
}
