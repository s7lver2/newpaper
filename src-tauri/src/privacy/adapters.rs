//! Adaptadores entre np-net/np-adblock y los puntos de extensión de np-shell.

use std::{
    collections::{HashMap, HashSet},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use np_adblock::{
    cosmetic_msg::{handle_cosmetic, parse_cosmetic_message},
    service::{AdblockService, BlockedNotifier},
};
use np_net::{controller::tor_browser_args, NetController, NetMode, Traffic};
use np_shell::{
    extensions::{
        ContentMessageHandler, ContentWebviewHook, HttpClientProvider, HttpPurpose, WebviewProfile, WebviewProfileProvider,
        DEFAULT_BROWSER_ARGS,
    },
    TabId,
};
use serde_json::Value;
use tauri::{AppHandle, Emitter};

pub fn profile_for(mode: NetMode, socks_port: u16, without_tor: bool) -> WebviewProfile {
    if mode == NetMode::Direct || without_tor {
        return WebviewProfile { data_dir_name: "direct".into(), additional_browser_args: DEFAULT_BROWSER_ARGS.into() };
    }
    WebviewProfile {
        data_dir_name: "tor".into(),
        additional_browser_args: format!("{DEFAULT_BROWSER_ARGS} {}", tor_browser_args(socks_port)),
    }
}

pub fn traffic_for(p: HttpPurpose) -> Traffic {
    match p {
        HttpPurpose::Content | HttpPurpose::Search | HttpPurpose::Archive => Traffic::Web,
        HttpPurpose::Feeds => Traffic::Feeds,
        HttpPurpose::Ai => Traffic::Ai,
        HttpPurpose::Updates => Traffic::Updates,
    }
}

pub struct NetProfiles {
    net: Arc<NetController>,
    without_tor: Mutex<HashSet<TabId>>,
}

impl NetProfiles {
    pub fn new(net: Arc<NetController>) -> Self {
        Self { net, without_tor: Mutex::default() }
    }
    pub fn mark_without_tor(&self, tab: TabId) {
        self.without_tor.lock().expect("lock").insert(tab);
    }
    pub fn forget(&self, tab: TabId) {
        self.without_tor.lock().expect("lock").remove(&tab);
    }
    pub fn without_tor(&self) -> Vec<TabId> {
        let mut v: Vec<TabId> = self.without_tor.lock().expect("lock").iter().copied().collect();
        v.sort();
        v
    }
}

impl WebviewProfileProvider for NetProfiles {
    fn profile_for_tab(&self, tab: TabId) -> WebviewProfile {
        let without = self.without_tor.lock().expect("lock").contains(&tab);
        profile_for(self.net.settings().mode, self.net.socks_port(), without)
    }
}

pub struct NetHttp(pub Arc<NetController>);

impl HttpClientProvider for NetHttp {
    fn client(&self, purpose: HttpPurpose) -> Result<reqwest::Client, String> {
        Ok(self.0.http_client(traffic_for(purpose)))
    }
}

/// Los marcados "sin Tor" no se olvidan al cerrar la webview: `recreate_tab` la cierra y la vuelve a crear.
pub struct AdblockHook {
    pub svc: Arc<AdblockService>,
}

impl ContentWebviewHook for AdblockHook {
    fn on_content_webview_created(&self, tab: TabId, webview: &tauri::Webview) {
        #[cfg(windows)]
        if let Err(e) = np_adblock::webview2::attach(webview, tab, self.svc.clone()) {
            tracing::error!(tab, error = %e, "adblock hook failed");
        }
        #[cfg(not(windows))]
        let _ = (tab, webview);
    }
    fn on_content_webview_closed(&self, tab: TabId) {
        self.svc.stats().remove_tab(tab);
    }
}

pub struct CosmeticHandler(pub Arc<AdblockService>);

impl ContentMessageHandler for CosmeticHandler {
    fn handles(&self, kind: &str) -> bool {
        kind.starts_with("np-cosmetic-")
    }
    fn handle(&self, _tab: TabId, payload: &Value) -> Option<Value> {
        parse_cosmetic_message(payload).and_then(|req| handle_cosmetic(&self.0, req))
    }
}

pub struct Throttle {
    gap: Duration,
    last: Mutex<HashMap<TabId, Instant>>,
}

impl Throttle {
    pub fn new(gap: Duration) -> Self {
        Self { gap, last: Mutex::default() }
    }
    pub fn allow(&self, tab: TabId, now: Instant) -> bool {
        let mut last = self.last.lock().expect("lock");
        match last.get(&tab) {
            Some(t) if now.duration_since(*t) < self.gap => false,
            _ => {
                last.insert(tab, now);
                true
            }
        }
    }
}

/// Avisa a la UI de cada bloqueo (como mucho 4 veces por segundo y pestaña; el volcado de
/// estadísticas cada 5 s envía el valor final).
pub struct UiNotifier {
    app: AppHandle,
    throttle: Throttle,
}

impl UiNotifier {
    pub fn new(app: AppHandle) -> Self {
        Self { app, throttle: Throttle::new(Duration::from_millis(250)) }
    }
}

impl BlockedNotifier for UiNotifier {
    fn blocked(&self, tab: u64, tab_count: u64) {
        if self.throttle.allow(tab, Instant::now()) {
            let _ = self.app.emit_to("ui", "adblock://blocked", serde_json::json!({ "tabId": tab, "tabCount": tab_count }));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    #[test]
    fn direct_profile_uses_tauri_defaults() {
        let p = profile_for(NetMode::Direct, 50123, false);
        assert_eq!(p.data_dir_name, "direct");
        assert_eq!(p.additional_browser_args, DEFAULT_BROWSER_ARGS);
    }

    #[test]
    fn tor_profile_adds_proxy_flags_and_own_data_dir() {
        let p = profile_for(NetMode::Tor, 50123, false);
        assert_eq!(p.data_dir_name, "tor");
        assert!(p.additional_browser_args.starts_with(DEFAULT_BROWSER_ARGS));
        assert!(p.additional_browser_args.contains("socks5://127.0.0.1:50123"));
    }

    #[test]
    fn tabs_opened_without_tor_use_the_direct_profile() {
        assert_eq!(profile_for(NetMode::Tor, 50123, true).data_dir_name, "direct");
    }

    #[test]
    fn maps_http_purposes_to_traffic() {
        assert_eq!(traffic_for(HttpPurpose::Content), Traffic::Web);
        assert_eq!(traffic_for(HttpPurpose::Search), Traffic::Web);
        assert_eq!(traffic_for(HttpPurpose::Archive), Traffic::Web);
        assert_eq!(traffic_for(HttpPurpose::Feeds), Traffic::Feeds);
        assert_eq!(traffic_for(HttpPurpose::Ai), Traffic::Ai);
        assert_eq!(traffic_for(HttpPurpose::Updates), Traffic::Updates);
    }

    #[test]
    fn throttle_allows_one_event_per_gap_and_tab() {
        let t = Throttle::new(Duration::from_millis(250));
        let t0 = Instant::now();
        assert!(t.allow(1, t0));
        assert!(!t.allow(1, t0 + Duration::from_millis(100)));
        assert!(t.allow(2, t0 + Duration::from_millis(100)));
        assert!(t.allow(1, t0 + Duration::from_millis(300)));
    }
}
