//! Puntos de extensión del navegador para los demás subproyectos.
use std::{
    collections::HashSet,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, RwLock,
    },
    time::Duration,
};

use crate::TabId;

pub const DEFAULT_BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WebviewProfile {
    /// Subcarpeta de `<app_local_data>/webview/` usada como user data folder de WebView2.
    pub data_dir_name: String,
    /// Valor completo para `WebviewBuilder::additional_browser_args` (sustituye los de Tauri).
    pub additional_browser_args: String,
}

pub trait WebviewProfileProvider: Send + Sync {
    fn profile_for_tab(&self, tab: TabId) -> WebviewProfile;
}

pub trait ContentWebviewHook: Send + Sync {
    fn on_content_webview_created(&self, tab: TabId, webview: &tauri::Webview);
    fn on_content_webview_closed(&self, _tab: TabId) {}
}

/// Mensajes `{type, ...}` de las webviews de contenido con un `type` que no es del núcleo
/// (`page`, `nav`, `shortcut`). Ya validados como JSON objeto de tamaño ≤ 2 MiB; `payload` incluye `type`.
/// Si `handle` devuelve `Some(v)`, se responde con `PostWebMessageAsJson(v)` a la misma webview.
pub trait ContentMessageHandler: Send + Sync {
    fn handles(&self, kind: &str) -> bool;
    fn handle(&self, tab: TabId, payload: &serde_json::Value) -> Option<serde_json::Value>;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum HttpPurpose {
    /// Imágenes del lector y descargas de páginas (hemeroteca, ediciones sin conexión).
    Content,
    Feeds,
    Search,
    Archive,
    Ai,
    Updates,
}

pub trait HttpClientProvider: Send + Sync {
    fn client(&self, purpose: HttpPurpose) -> Result<reqwest::Client, String>;
}

/// Proveedor por defecto: conexión directa. El subproyecto 2 lo sustituye (Tor + kill switch).
pub struct DirectHttp {
    client: reqwest::Client,
}

impl Default for DirectHttp {
    fn default() -> Self {
        let client = reqwest::Client::builder()
            .user_agent(concat!("newpaper/", env!("CARGO_PKG_VERSION")))
            .connect_timeout(Duration::from_secs(15))
            .timeout(Duration::from_secs(60))
            .build()
            .expect("reqwest client");
        Self { client }
    }
}

impl HttpClientProvider for DirectHttp {
    fn client(&self, _purpose: HttpPurpose) -> Result<reqwest::Client, String> {
        Ok(self.client.clone())
    }
}

pub struct ShellExtensions {
    profile: RwLock<Option<Arc<dyn WebviewProfileProvider>>>,
    hooks: RwLock<Vec<Arc<dyn ContentWebviewHook>>>,
    handlers: RwLock<Vec<Arc<dyn ContentMessageHandler>>>,
    scripts: RwLock<Vec<String>>,
    http: RwLock<Arc<dyn HttpClientProvider>>,
    domains: RwLock<HashSet<String>>,
    reader_auto_open: AtomicBool,
    page_transition: AtomicBool,
    reduced_motion: AtomicBool,
}

impl Default for ShellExtensions {
    fn default() -> Self {
        Self::new()
    }
}

impl ShellExtensions {
    pub fn new() -> Self {
        Self {
            profile: RwLock::new(None),
            hooks: RwLock::default(),
            handlers: RwLock::default(),
            scripts: RwLock::default(),
            http: RwLock::new(Arc::new(DirectHttp::default())),
            domains: RwLock::default(),
            reader_auto_open: AtomicBool::new(true),
            page_transition: AtomicBool::new(true),
            reduced_motion: AtomicBool::new(false),
        }
    }

    pub fn set_profile_provider(&self, p: Arc<dyn WebviewProfileProvider>) {
        *self.profile.write().expect("ext lock") = Some(p);
    }

    pub fn profile_for_tab(&self, tab: TabId) -> WebviewProfile {
        match self.profile.read().expect("ext lock").as_ref() {
            Some(p) => p.profile_for_tab(tab),
            None => WebviewProfile { data_dir_name: "direct".into(), additional_browser_args: DEFAULT_BROWSER_ARGS.into() },
        }
    }

    pub fn add_hook(&self, h: Arc<dyn ContentWebviewHook>) {
        self.hooks.write().expect("ext lock").push(h);
    }

    pub fn hooks(&self) -> Vec<Arc<dyn ContentWebviewHook>> {
        self.hooks.read().expect("ext lock").clone()
    }

    pub fn add_message_handler(&self, h: Arc<dyn ContentMessageHandler>) {
        self.handlers.write().expect("ext lock").push(h);
    }

    pub fn handler_for(&self, kind: &str) -> Option<Arc<dyn ContentMessageHandler>> {
        self.handlers.read().expect("ext lock").iter().find(|h| h.handles(kind)).cloned()
    }

    pub fn add_init_script(&self, js: String) {
        self.scripts.write().expect("ext lock").push(js);
    }

    pub fn init_scripts(&self) -> Vec<String> {
        self.scripts.read().expect("ext lock").clone()
    }

    pub fn set_http_provider(&self, p: Arc<dyn HttpClientProvider>) {
        *self.http.write().expect("ext lock") = p;
    }

    pub fn http_client(&self, purpose: HttpPurpose) -> Result<reqwest::Client, String> {
        let provider = self.http.read().expect("ext lock").clone();
        provider.client(purpose)
    }

    pub fn set_known_domains(&self, domains: impl IntoIterator<Item = String>) {
        *self.domains.write().expect("ext lock") = domains.into_iter().map(|d| d.to_ascii_lowercase()).collect();
    }

    pub fn known_domains(&self) -> HashSet<String> {
        self.domains.read().expect("ext lock").clone()
    }

    pub fn set_reader_auto_open(&self, on: bool) {
        self.reader_auto_open.store(on, Ordering::Relaxed);
    }

    /// Ajuste `appearance.pageTransition` (por defecto activado).
    pub fn set_page_transition(&self, on: bool) {
        self.page_transition.store(on, Ordering::Relaxed);
    }

    pub fn page_transition(&self) -> bool {
        self.page_transition.load(Ordering::Relaxed)
    }

    /// `prefers-reduced-motion` de la UI: sin transiciones.
    pub fn set_reduced_motion(&self, on: bool) {
        self.reduced_motion.store(on, Ordering::Relaxed);
    }

    pub fn reduced_motion(&self) -> bool {
        self.reduced_motion.load(Ordering::Relaxed)
    }

    pub fn reader_auto_open(&self) -> bool {
        self.reader_auto_open.load(Ordering::Relaxed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};

    struct Fixed;
    impl WebviewProfileProvider for Fixed {
        fn profile_for_tab(&self, tab: TabId) -> WebviewProfile {
            WebviewProfile { data_dir_name: format!("tor-{tab}"), additional_browser_args: "--x".into() }
        }
    }

    struct Echo;
    impl ContentMessageHandler for Echo {
        fn handles(&self, kind: &str) -> bool {
            kind == "echo"
        }
        fn handle(&self, tab: TabId, payload: &Value) -> Option<Value> {
            Some(json!({ "tab": tab, "got": payload }))
        }
    }

    struct Failing;
    impl HttpClientProvider for Failing {
        fn client(&self, _p: HttpPurpose) -> Result<reqwest::Client, String> {
            Err("tor not ready".into())
        }
    }

    #[test]
    fn default_profile_is_direct_with_tauri_default_args() {
        let e = ShellExtensions::new();
        let p = e.profile_for_tab(1);
        assert_eq!(p.data_dir_name, "direct");
        assert_eq!(p.additional_browser_args, DEFAULT_BROWSER_ARGS);
        e.set_profile_provider(Arc::new(Fixed));
        assert_eq!(e.profile_for_tab(7).data_dir_name, "tor-7");
    }

    #[test]
    fn routes_messages_to_the_matching_handler() {
        let e = ShellExtensions::new();
        assert!(e.handler_for("echo").is_none());
        e.add_message_handler(Arc::new(Echo));
        let out = e.handler_for("echo").unwrap().handle(3, &json!({"a": 1})).unwrap();
        assert_eq!(out, json!({"tab": 3, "got": {"a": 1}}));
    }

    #[test]
    fn http_provider_can_be_replaced_and_errors_propagate() {
        let e = ShellExtensions::new();
        assert!(e.http_client(HttpPurpose::Feeds).is_ok());
        e.set_http_provider(Arc::new(Failing));
        assert_eq!(e.http_client(HttpPurpose::Ai).unwrap_err(), "tor not ready");
    }

    #[test]
    fn stores_init_scripts_domains_and_reader_flag() {
        let e = ShellExtensions::new();
        e.add_init_script("1;".into());
        e.add_init_script("2;".into());
        assert_eq!(e.init_scripts(), vec!["1;".to_string(), "2;".to_string()]);
        e.set_known_domains(vec!["elpais.com".to_string()]);
        assert!(e.known_domains().contains("elpais.com"));
        assert!(e.reader_auto_open());
        e.set_reader_auto_open(false);
        assert!(!e.reader_auto_open());
    }
}
