use std::sync::Arc;

use np_mobile_core::proxy::{decide, ProxyDecision};
use np_net::NetController;
use tauri::{AppHandle, Wry};
use tauri_plugin_np_mobile::{NpMobileExt, ProxyArg};

fn apply(app: &AppHandle<Wry>, net: &NetController) {
    let s = net.status();
    let arg = match decide(s.mode, &s.tor, s.socks_port) {
        ProxyDecision::Direct => ProxyArg::Direct,
        ProxyDecision::Socks { port } => ProxyArg::Socks { port },
        ProxyDecision::Block => ProxyArg::Block,
    };
    if let Err(e) = app.np_mobile().set_proxy(arg) {
        tracing::warn!(error = %e, "webview proxy not applied");
    }
}

/// El proxy de la webview nativa lo decide solo Rust (decisión 5).
pub fn follow(app: AppHandle<Wry>, net: Arc<NetController>) {
    apply(&app, &net);
    let mut rx = net.subscribe();
    tauri::async_runtime::spawn(async move {
        while rx.changed().await.is_ok() {
            apply(&app, &net);
        }
    });
}
