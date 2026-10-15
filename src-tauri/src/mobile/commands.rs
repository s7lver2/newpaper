use std::sync::Arc;

use np_ai_proxy::{AuthScheme, CustomEndpoint, proxy::AiProxy};
use np_mobile_core::{fetch::fetch_page, ollama::classify, share::extract_url};
use np_shell::extensions::{HttpPurpose, ShellExtensions};
use np_store::Store;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State, Wry};
use tauri_plugin_np_mobile::{NpMobileExt, OriginalLabels};

use crate::error::{CmdError, CmdResult};

#[tauri::command]
pub async fn mobile_fetch_page(ext: State<'_, Arc<ShellExtensions>>, url: String) -> CmdResult<String> {
    let client = ext.http_client(HttpPurpose::Content).map_err(|e| CmdError::new("network", e))?;
    fetch_page(&client, &url).await.map_err(|e| CmdError::new("fetch", serde_json::to_string(&e).unwrap_or_default()))
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
pub async fn mobile_original_open(app: AppHandle<Wry>, url: String, labels: Labels) -> CmdResult<()> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err(CmdError::new("invalid", "only http(s) urls"));
    }
    app.np_mobile()
        .original_open(&url, OriginalLabels { close: labels.close, analyze: labels.analyze })
        .map_err(|e| CmdError::new("mobile", e.0))
}

#[tauri::command]
pub async fn mobile_original_close(app: AppHandle<Wry>) -> CmdResult<()> {
    app.np_mobile().original_close().map_err(|e| CmdError::new("mobile", e.0))
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
    let c = reqwest::Client::builder()
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
