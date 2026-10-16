use std::sync::Arc;

use np_ai_proxy::{AuthScheme, CustomEndpoint, proxy::AiProxy};
use np_mobile_core::{fetch::fetch_page, ollama::classify, proxy::{decide, ProxyDecision}, share::extract_url};
use np_net::NetController;
use np_shell::extensions::{HttpPurpose, ShellExtensions};
use np_store::Store;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State, Wry};
use tauri_plugin_np_mobile::{DeviceInfo, Insets, NpMobileExt, OriginalLabels};

use crate::error::{CmdError, CmdResult};

#[tauri::command]
pub async fn mobile_fetch_page(ext: State<'_, Arc<ShellExtensions>>, url: String) -> CmdResult<String> {
    let client = ext.http_client(HttpPurpose::Content).map_err(|e| CmdError::new("network", e))?;
    fetch_page(&client, &url).await.map_err(|e| CmdError::new("fetch", serde_json::to_string(&e).unwrap_or_default()))
}

/// La interfaz avisa del tema que pinta (papel/tinta): Android no lo deduce con la actividad de borde a borde.
#[tauri::command]
pub async fn mobile_set_system_bars(app: AppHandle<Wry>, dark: bool) -> CmdResult<()> {
    app.np_mobile().system_bars(dark).map_err(|e| CmdError::new("mobile", e.0))
}

#[tauri::command]
pub async fn mobile_pending_share(app: AppHandle<Wry>) -> CmdResult<Option<String>> {
    let text = app.np_mobile().pending_share().map_err(|e| CmdError::new("mobile", e.0))?;
    Ok(text.as_deref().and_then(extract_url))
}

#[derive(Deserialize)]
pub struct Labels {
    pub close: String,
    pub analyze: String,
}

#[tauri::command]
pub async fn mobile_original_open(app: AppHandle<Wry>, net: State<'_, Arc<NetController>>, url: String, labels: Labels) -> CmdResult<()> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err(CmdError::new("invalid", "only http(s) urls"));
    }
    // Kill switch (decisión 5): con Tor pedido y no listo, la webview original no se abre.
    let s = net.status();
    if decide(s.mode, &s.tor, s.socks_port) == ProxyDecision::Block {
        return Err(CmdError::new("tor_not_ready", "Tor no está listo: la webview original no se abre"));
    }
    // En modo Tor la webview recibe un SOCKS de sesión propio (puerto efímero, cerrado al cerrar la webview).
    super::proxy::begin_session(&app, &net).await.map_err(|e| CmdError::new("mobile", e))?;
    let opened = app
        .np_mobile()
        .original_open(&url, OriginalLabels { close: labels.close, analyze: labels.analyze })
        .map_err(|e| CmdError::new("mobile", e.0));
    if opened.is_err() {
        super::proxy::end_session(&app, &net);
    }
    opened
}

#[tauri::command]
pub async fn mobile_original_close(app: AppHandle<Wry>, net: State<'_, Arc<NetController>>) -> CmdResult<()> {
    let closed = app.np_mobile().original_close().map_err(|e| CmdError::new("mobile", e.0));
    super::proxy::end_session(&app, &net);
    closed
}

#[derive(Serialize)]
pub struct OllamaProbe {
    pub base: String,
    pub models: Vec<String>,
}

/// Sondea el Ollama de una dirección de red privada o Tailscale. Directo, nunca por Tor (§13).
#[tauri::command]
pub async fn mobile_ollama_probe(url: String) -> CmdResult<OllamaProbe> {
    let ep = classify(&url).map_err(|e| CmdError::new("ollama_address", format!("{e:?}")))?;
    let c = np_net::with_roots(reqwest::Client::builder())
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .map_err(|e| CmdError::new("network", e.to_string()))?;
    let v: serde_json::Value = c
        .get(format!("{}/api/tags", ep.base))
        .send()
        .await
        .map_err(|e| CmdError::new("network", e.to_string()))?
        .json()
        .await
        .map_err(|e| CmdError::new("ollama", e.to_string()))?;
    let models = v["models"]
        .as_array()
        .map(|a| a.iter().filter_map(|m| m["name"].as_str().map(String::from)).collect())
        .unwrap_or_default();
    Ok(OllamaProbe { base: ep.base, models })
}

/// Registra el Ollama del PC como endpoint `ollama` (id que el proveedor acepta para endpoints locales).
#[tauri::command]
pub async fn mobile_use_pc_ollama(proxy: State<'_, Arc<AiProxy>>, store: State<'_, Arc<Store>>, base: String) -> CmdResult<()> {
    let ep = classify(&base).map_err(|e| CmdError::new("ollama_address", format!("{e:?}")))?;
    let endpoints = vec![CustomEndpoint {
        id: "ollama".into(),
        base_url: format!("{}/v1", ep.base),
        auth: AuthScheme::None,
        local: ep.base.starts_with("http://"),
    }];
    proxy.set_custom(&endpoints).map_err(|e| CmdError::new(e.code(), e.to_string()))?;
    store.set_setting("ai.customEndpoints", &endpoints)?;
    Ok(())
}

/// Márgenes de las barras del sistema (px CSS), medidos por el plugin nativo.
#[tauri::command]
pub async fn mobile_insets(app: AppHandle<Wry>) -> CmdResult<Insets> {
    app.np_mobile().insets().map_err(|e| CmdError::new("mobile", e.0))
}

/// Contadores de anuncios y rastreadores bloqueados en la webview original (hoy y en total).
#[tauri::command]
pub async fn mobile_block_counts(store: State<'_, Arc<Store>>) -> CmdResult<np_adblock::kind_stats::BlockCounts> {
    let kinds = super::KINDS.get().ok_or_else(|| CmdError::new("mobile", "counters not ready"))?;
    let day = np_adblock::stats::today_local();
    Ok(store.with_conn(|c| kinds.snapshot(c, &day))?)
}

#[tauri::command]
pub async fn mobile_block_reset(store: State<'_, Arc<Store>>) -> CmdResult<np_adblock::kind_stats::BlockCounts> {
    let kinds = super::KINDS.get().ok_or_else(|| CmdError::new("mobile", "counters not ready"))?;
    store.with_conn(|c| kinds.reset(c))?;
    let day = np_adblock::stats::today_local();
    Ok(store.with_conn(|c| kinds.snapshot(c, &day))?)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AboutInfo {
    pub build: super::about::BuildInfo,
    pub device: DeviceInfo,
    pub net_mode: String,
    pub data_bytes: u64,
}

/// Información de la compilación y del dispositivo para «Acerca de».
#[tauri::command]
pub async fn mobile_about(app: AppHandle<Wry>, net: State<'_, Arc<NetController>>) -> CmdResult<AboutInfo> {
    let device = app.np_mobile().device_info().unwrap_or_default();
    let net_mode = serde_json::to_value(net.status().mode).ok().and_then(|v| v.as_str().map(String::from)).unwrap_or_default();
    let mut dirs = Vec::new();
    for d in [app.path().app_local_data_dir().ok(), app.path().app_data_dir().ok()].into_iter().flatten() {
        if !dirs.contains(&d) {
            dirs.push(d);
        }
    }
    let data_bytes = tauri::async_runtime::spawn_blocking(move || dirs.iter().map(|d| super::about::dir_size(d)).sum::<u64>())
        .await
        .unwrap_or(0);
    Ok(AboutInfo { build: super::about::build_info(), device, net_mode, data_bytes })
}
