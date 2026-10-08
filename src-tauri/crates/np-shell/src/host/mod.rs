//! Pegamento con Tauri: una webview hija `tab-<id>` por pestaña web dentro de la ventana `main`.
pub mod events;
#[cfg(windows)]
mod win;

use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex},
};

use serde::{Deserialize, Serialize};
use tauri::{
    webview::{PageLoadEvent, WebviewBuilder},
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Webview, WebviewUrl,
};

use crate::{
    extensions::ShellExtensions,
    input::{parse_input, search_url, Target},
    message::{parse_content_message, ContentMessage, PagePayload},
    model::{NavFailure, TabInfo, TabKind, TabList, TabView, TabsSnapshot},
    news::is_news,
    TabId, NEW_TAB_URL,
};
use events::*;

pub const CONTENT_SCRIPT: &str = include_str!("../../../../../packages/extract/dist/content.js");
const MAIN_WINDOW: &str = "main";
const UI_WEBVIEW: &str = "ui";

#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, thiserror::Error)]
pub enum ShellError {
    #[error("main window not found")]
    NoWindow,
    #[error("tab {0} not found")]
    NoTab(TabId),
    #[error("tauri: {0}")]
    Tauri(String),
}

impl From<tauri::Error> for ShellError {
    fn from(e: tauri::Error) -> Self {
        ShellError::Tauri(e.to_string())
    }
}

/// Resultado de `NavigationCompleted` leído en `win.rs`.
#[derive(Debug, Clone)]
pub struct NavOutcome {
    pub url: String,
    pub success: bool,
    pub web_error_status: i32,
    pub http_status: Option<u16>,
    pub can_go_back: bool,
    pub can_go_forward: bool,
}

pub struct TabManager {
    app: AppHandle,
    ext: Arc<ShellExtensions>,
    webview_root: PathBuf,
    tabs: Mutex<TabList>,
    bounds: Mutex<Rect>,
    last_nav: Mutex<HashMap<TabId, (String, String)>>,
}

fn label(id: TabId) -> String {
    format!("tab-{id}")
}

impl TabManager {
    pub fn new(app: AppHandle, ext: Arc<ShellExtensions>, webview_root: PathBuf) -> Self {
        Self {
            app,
            ext,
            webview_root,
            tabs: Mutex::new(TabList::new()),
            bounds: Mutex::new(Rect::default()),
            last_nav: Mutex::default(),
        }
    }

    fn webview(&self, id: TabId) -> Option<Webview> {
        self.app.get_webview(&label(id))
    }

    pub fn snapshot(&self) -> TabsSnapshot {
        self.tabs.lock().expect("tabs lock").snapshot()
    }

    pub fn tab(&self, id: TabId) -> Option<TabInfo> {
        self.tabs.lock().expect("tabs lock").get(id).cloned()
    }

    fn emit_tabs(&self) {
        let _ = self.app.emit_to(UI_WEBVIEW, TABS_CHANGED, self.snapshot());
    }

    fn update(&self, id: TabId, f: impl FnOnce(&mut TabInfo)) {
        if let Some(t) = self.tabs.lock().expect("tabs lock").get_mut(id) {
            f(t);
        }
    }

    async fn create_webview(&self, id: TabId, url: url::Url, private: bool) -> Result<(), ShellError> {
        let window = self.app.get_window(MAIN_WINDOW).ok_or(ShellError::NoWindow)?;
        let profile = self.ext.profile_for_tab(id);
        let mut builder = WebviewBuilder::new(label(id), WebviewUrl::External(url))
            .initialization_script(CONTENT_SCRIPT)
            .data_directory(self.webview_root.join(&profile.data_dir_name))
            .additional_browser_args(&profile.additional_browser_args)
            .incognito(private)
            .on_navigation(|u| matches!(u.scheme(), "http" | "https"));
        for js in self.ext.init_scripts() {
            builder = builder.initialization_script(&js);
        }
        let app = self.app.clone();
        builder = builder.on_page_load(move |_wv, payload| {
            let mgr = app.state::<Arc<TabManager>>();
            let started = matches!(payload.event(), PageLoadEvent::Started);
            let url = payload.url().to_string();
            mgr.update(id, |t| {
                t.loading = started;
                if started {
                    t.url = url;
                    t.failure = None;
                    t.crashed = false;
                    t.is_news = false;
                    t.view = TabView::Original;
                }
            });
            mgr.apply_visibility();
            mgr.emit_tabs();
        });
        let r = *self.bounds.lock().expect("bounds lock");
        let webview = window.add_child(builder, LogicalPosition::new(r.x, r.y), LogicalSize::new(r.width.max(1.0), r.height.max(1.0)))?;
        #[cfg(windows)]
        win::attach(&self.app, id, &webview)?;
        for h in self.ext.hooks() {
            h.on_content_webview_created(id, &webview);
        }
        Ok(())
    }

    fn close_webview(&self, id: TabId) {
        if let Some(wv) = self.webview(id) {
            let _ = wv.close();
            for h in self.ext.hooks() {
                h.on_content_webview_closed(id);
            }
        }
    }

    pub async fn open(&self, url: Option<String>, private: bool, activate: bool) -> Result<TabInfo, ShellError> {
        let url = url.unwrap_or_else(|| NEW_TAB_URL.to_string());
        let target = parse_input(&url).unwrap_or(Target::Internal(NEW_TAB_URL.into()));
        let resolved = match &target {
            Target::Web(u) => u.to_string(),
            Target::Internal(s) => s.clone(),
            Target::Search(q) => search_url(q),
        };
        let id = self.tabs.lock().expect("tabs lock").open(&resolved, private, activate);
        if let Target::Web(u) = target {
            self.create_webview(id, u, private).await?;
        }
        self.apply_visibility();
        self.emit_tabs();
        self.tab(id).ok_or(ShellError::NoTab(id))
    }

    pub async fn close(&self, id: TabId) -> Result<(), ShellError> {
        self.close_webview(id);
        self.tabs.lock().expect("tabs lock").close(id).ok_or(ShellError::NoTab(id))?;
        self.last_nav.lock().expect("nav lock").remove(&id);
        self.apply_visibility();
        self.emit_tabs();
        Ok(())
    }

    pub fn activate(&self, id: TabId) -> Result<(), ShellError> {
        if !self.tabs.lock().expect("tabs lock").activate(id) {
            return Err(ShellError::NoTab(id));
        }
        self.apply_visibility();
        self.emit_tabs();
        Ok(())
    }

    pub async fn navigate(&self, id: TabId, input: &str) -> Result<(), ShellError> {
        let tab = self.tab(id).ok_or(ShellError::NoTab(id))?;
        match parse_input(input) {
            None => Ok(()),
            Some(Target::Web(u)) => {
                self.tabs.lock().expect("tabs lock").set_url(id, u.as_str());
                match self.webview(id) {
                    Some(wv) => wv.navigate(u)?,
                    None => self.create_webview(id, u, tab.private).await?,
                }
                self.apply_visibility();
                self.emit_tabs();
                Ok(())
            }
            Some(Target::Internal(s)) => self.go_internal(id, &s),
            Some(Target::Search(q)) => self.go_internal(id, &search_url(&q)),
        }
    }

    fn go_internal(&self, id: TabId, url: &str) -> Result<(), ShellError> {
        self.close_webview(id);
        self.tabs.lock().expect("tabs lock").set_url(id, url);
        self.apply_visibility();
        self.emit_tabs();
        Ok(())
    }

    pub async fn back(&self, id: TabId) -> Result<(), ShellError> {
        let tab = self.tab(id).ok_or(ShellError::NoTab(id))?;
        if tab.kind == TabKind::Web && tab.can_go_back {
            return self.eval_in_tab(id, "history.back()");
        }
        let back = self.tabs.lock().expect("tabs lock").take_back_internal(id);
        match back {
            Some(internal) => self.go_internal(id, &internal),
            None => Ok(()),
        }
    }

    pub async fn forward(&self, id: TabId) -> Result<(), ShellError> {
        self.eval_in_tab(id, "history.forward()")
    }

    pub async fn reload(&self, id: TabId) -> Result<(), ShellError> {
        let tab = self.tab(id).ok_or(ShellError::NoTab(id))?;
        if tab.crashed || self.webview(id).is_none() && tab.kind == TabKind::Web {
            return self.recreate_tab(id).await;
        }
        if let Some(wv) = self.webview(id) {
            self.update(id, |t| t.failure = None);
            wv.reload()?;
        }
        Ok(())
    }

    pub fn eval_in_tab(&self, id: TabId, js: &str) -> Result<(), ShellError> {
        self.webview(id).ok_or(ShellError::NoTab(id))?.eval(js)?;
        Ok(())
    }

    pub fn set_view(&self, id: TabId, view: TabView) -> Result<(), ShellError> {
        self.update(id, |t| t.view = view);
        self.apply_visibility();
        self.emit_tabs();
        Ok(())
    }

    pub fn set_bounds(&self, r: Rect) {
        *self.bounds.lock().expect("bounds lock") = r;
        let ids = self.tabs.lock().expect("tabs lock").ids();
        for id in ids {
            if let Some(wv) = self.webview(id) {
                let _ = wv.set_bounds(tauri::Rect {
                    position: LogicalPosition::new(r.x, r.y).into(),
                    size: LogicalSize::new(r.width.max(1.0), r.height.max(1.0)).into(),
                });
            }
        }
    }

    /// Solo se ve la webview de la pestaña activa, en vista "original", sin fallo ni cuelgue.
    fn apply_visibility(&self) {
        let snap = self.snapshot();
        for t in &snap.tabs {
            let Some(wv) = self.webview(t.id) else { continue };
            let visible = snap.active_id == Some(t.id) && t.view == TabView::Original && t.failure.is_none() && !t.crashed;
            let _ = if visible { wv.show() } else { wv.hide() };
        }
    }

    pub async fn recreate_tab(&self, id: TabId) -> Result<(), ShellError> {
        let tab = self.tab(id).ok_or(ShellError::NoTab(id))?;
        self.close_webview(id);
        if tab.kind == TabKind::Web {
            let url = url::Url::parse(&tab.url).map_err(|e| ShellError::Tauri(e.to_string()))?;
            self.update(id, |t| {
                t.crashed = false;
                t.failure = None;
            });
            self.create_webview(id, url, tab.private).await?;
        }
        self.apply_visibility();
        self.emit_tabs();
        Ok(())
    }

    /// "Recrear el entorno WebView2" (spec §4.2): cierra y vuelve a crear todas las webviews de contenido.
    pub async fn recreate_all_content_webviews(&self) -> Result<(), ShellError> {
        let ids = self.tabs.lock().expect("tabs lock").ids();
        for id in ids {
            if self.tab(id).is_some_and(|t| t.kind == TabKind::Web) {
                self.recreate_tab(id).await?;
            }
        }
        Ok(())
    }

    // ---- Llamadas desde los manejadores de WebView2 (hilo de UI; nunca crean webviews) ----

    /// Devuelve la respuesta para `PostWebMessageAsJson`, si la hay.
    pub(crate) fn handle_raw_message(&self, id: TabId, raw: &str, source: &str) -> Option<serde_json::Value> {
        match parse_content_message(raw, source) {
            Ok(ContentMessage::Page(p)) => {
                self.on_page(id, p);
                None
            }
            Ok(ContentMessage::Nav { url, title }) => {
                self.on_nav(id, url, title);
                None
            }
            Ok(ContentMessage::Shortcut(action)) => {
                let _ = self.app.emit_to(UI_WEBVIEW, TAB_SHORTCUT, TabShortcutEvent { tab_id: id, action });
                None
            }
            Ok(ContentMessage::Other { kind, payload }) => self.ext.handler_for(&kind).and_then(|h| h.handle(id, &payload)),
            Err(e) => {
                tracing::debug!(tab = id, error = %e, "content message rejected");
                None
            }
        }
    }

    fn on_page(&self, id: TabId, page: PagePayload) {
        let news = page.article && is_news(&page.url, &page.signals, &self.ext.known_domains());
        let auto = news && self.ext.reader_auto_open();
        self.update(id, |t| {
            t.is_news = news;
            if !page.title.is_empty() {
                t.title = page.title.clone();
            }
            if auto {
                t.view = TabView::Reader;
            }
        });
        self.apply_visibility();
        self.emit_tabs();
        let _ = self.app.emit_to(UI_WEBVIEW, TAB_PAGE, TabPageEvent { tab_id: id, article: page, is_news: news });
    }

    fn on_nav(&self, id: TabId, url: String, title: String) {
        {
            let mut last = self.last_nav.lock().expect("nav lock");
            if last.get(&id) == Some(&(url.clone(), title.clone())) {
                return;
            }
            last.insert(id, (url.clone(), title.clone()));
        }
        self.update(id, |t| {
            t.url = url;
            t.title = title;
        });
        self.emit_tabs();
    }

    pub(crate) fn on_navigation_completed(&self, id: TabId, o: NavOutcome) {
        let failed = !o.success || o.http_status.is_some_and(|s| s >= 400);
        self.update(id, |t| {
            t.loading = false;
            t.can_go_back = o.can_go_back;
            t.can_go_forward = o.can_go_forward;
            t.url = o.url.clone();
            t.failure = failed.then(|| NavFailure { url: o.url.clone(), web_error_status: o.web_error_status, http_status: o.http_status });
        });
        self.apply_visibility();
        self.emit_tabs();
    }

    pub(crate) fn on_process_failed(&self, id: TabId, kind: i32) {
        tracing::warn!(tab = id, kind, "content process failed");
        self.update(id, |t| {
            t.crashed = true;
            t.loading = false;
        });
        self.apply_visibility();
        self.emit_tabs();
    }
}
