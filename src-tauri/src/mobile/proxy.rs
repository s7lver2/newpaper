use std::sync::{Arc, Mutex};

use np_mobile_core::proxy::{decide, ProxyDecision};
use np_net::{NetController, SocksServer};
use tauri::{AppHandle, Wry};
use tauri_plugin_np_mobile::{NpMobileExt, ProxyArg};

/// SOCKS de sesión de la webview original (ver `NetController::session_socks`). Solo existe mientras ella está abierta.
static SESSION: Mutex<Option<SocksServer>> = Mutex::new(None);

fn session_port() -> Option<u16> {
    SESSION.lock().expect("session lock").as_ref().map(SocksServer::port)
}

/// Qué proxy lleva la webview: Directa -> directo; Tor listo -> el SOCKS de sesión si hay webview original abierta
/// (si no, el puerto cerrado); Tor no listo -> puerto cerrado. Nunca cae a directo con Tor pedido.
fn arg_for(net: &NetController) -> ProxyArg {
    let s = net.status();
    match decide(s.mode, &s.tor, s.socks_port) {
        ProxyDecision::Direct => ProxyArg::Direct,
        ProxyDecision::Socks { .. } => session_port().map_or(ProxyArg::Block, |port| ProxyArg::Socks { port }),
        ProxyDecision::Block => ProxyArg::Block,
    }
}

/// Abre el SOCKS de sesión (si el modo es Tor) y aplica el proxy a la webview antes de abrirla.
pub async fn begin_session(app: &AppHandle<Wry>, net: &NetController) -> Result<(), String> {
    let s = net.status();
    if matches!(decide(s.mode, &s.tor, s.socks_port), ProxyDecision::Socks { .. }) {
        let server = net.session_socks().await.map_err(|e| e.to_string())?;
        *SESSION.lock().expect("session lock") = Some(server);
    }
    app.np_mobile().set_proxy(arg_for(net)).map_err(|e| e.0)
}

/// Cierra el SOCKS de sesión y devuelve la webview al puerto cerrado (o a directo).
pub fn end_session(app: &AppHandle<Wry>, net: &NetController) {
    SESSION.lock().expect("session lock").take();
    apply(app, net);
}

fn apply(app: &AppHandle<Wry>, net: &NetController) {
    let arg = arg_for(net);
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
