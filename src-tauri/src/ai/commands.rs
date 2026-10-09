use std::sync::Arc;

use np_ai_proxy::{
    cache::{self, CachedStage},
    proxy::{AiProxy, ProxyEvent, ProxyRequest},
    sources::{fetch_source, is_allowed},
    usage::{self, MonthUsage},
    CustomEndpoint,
};
use np_shell::extensions::{HttpPurpose, ShellExtensions};
use np_store::Store;
use serde::Serialize;
use tauri::{ipc::Channel, State};

use super::{ollama_models, openai_models, AiConfig};
use crate::{
    error::{CmdError, CmdResult},
    sources::content_locale,
};

fn pe(e: np_ai_proxy::ProxyError) -> CmdError {
    CmdError::new(e.code(), e.to_string())
}

/// Sin redirecciones: el proxy de IA añade claves y las fuentes se revalidan en cada salto.
fn client(ext: &ShellExtensions, p: HttpPurpose) -> CmdResult<reqwest::Client> {
    ext.http_client_strict(p).map_err(|e| CmdError::new("network", e))
}

#[tauri::command]
pub async fn ai_fetch(
    proxy: State<'_, Arc<AiProxy>>,
    ext: State<'_, Arc<ShellExtensions>>,
    provider: String,
    request: ProxyRequest,
    on_event: Channel<ProxyEvent>,
) -> CmdResult<()> {
    let c = client(&ext, HttpPurpose::Ai)?;
    // Los errores ya viajan como `ProxyEvent::Error` por el canal; el comando termina bien.
    // Si la webview cierra el canal, la descarga se corta (no se sigue consumiendo red y memoria).
    let _ = proxy.execute_live(&provider, request, c, move |e| on_event.send(e).is_ok()).await;
    Ok(())
}

#[tauri::command]
pub async fn ai_cancel(proxy: State<'_, Arc<AiProxy>>, request_id: String) -> CmdResult<bool> {
    Ok(proxy.cancel(&request_id))
}

#[tauri::command]
pub async fn ai_set_endpoints(proxy: State<'_, Arc<AiProxy>>, store: State<'_, Arc<Store>>, endpoints: Vec<CustomEndpoint>) -> CmdResult<()> {
    proxy.set_custom(&endpoints).map_err(pe)?;
    store.set_setting("ai.customEndpoints", &endpoints)?;
    Ok(())
}

#[tauri::command]
pub async fn source_fetch(
    cfg: State<'_, Arc<AiConfig>>,
    store: State<'_, Arc<Store>>,
    ext: State<'_, Arc<ShellExtensions>>,
    url: String,
    allow_extra: Vec<String>,
) -> CmdResult<String> {
    let lang = content_locale(&store);
    let wl = cfg.primary_sources.read().expect("lock").get(&lang).cloned().unwrap_or_default();
    if !is_allowed(&url, &wl, &allow_extra) {
        return Err(CmdError::new("source_not_allowed", url));
    }
    fetch_source(&client(&ext, HttpPurpose::Content)?, &url, |u| is_allowed(u, &wl, &allow_extra)).await.map_err(pe)
}

#[tauri::command]
pub async fn analysis_cache_get(store: State<'_, Arc<Store>>, url: String, text_hash: String, stage: String) -> CmdResult<Option<CachedStage>> {
    Ok(cache::get(&store, &url, &text_hash, &stage, chrono::Utc::now().timestamp_millis())?)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn analysis_cache_put(store: State<'_, Arc<Store>>, url: String, text_hash: String, stage: String, json: String, model: Option<String>, cost: f64) -> CmdResult<()> {
    Ok(cache::put(&store, &url, &text_hash, &stage, &json, model.as_deref(), cost, chrono::Utc::now().timestamp_millis())?)
}

fn month_now() -> String {
    chrono::Utc::now().format("%Y-%m").to_string()
}

#[tauri::command]
pub async fn usage_record(store: State<'_, Arc<Store>>, provider: String, model: String, input_tokens: i64, output_tokens: i64, cost: f64) -> CmdResult<()> {
    Ok(usage::record(&store, &month_now(), &provider, &model, input_tokens, output_tokens, cost)?)
}

#[tauri::command]
pub async fn usage_month(store: State<'_, Arc<Store>>, month: Option<String>) -> CmdResult<MonthUsage> {
    Ok(usage::month_total(&store, &month.unwrap_or_else(month_now))?)
}

#[derive(Serialize)]
pub struct LocalProbe {
    pub ollama: Option<Vec<String>>,
    pub lmstudio: Option<Vec<String>>,
}

/// Detecta Ollama y LM Studio en `localhost` (§6.1.1 "aparecen como Detectado").
#[tauri::command]
pub async fn ai_local_probe() -> CmdResult<LocalProbe> {
    let c = reqwest::Client::builder().no_proxy().timeout(std::time::Duration::from_millis(800)).build().map_err(|e| CmdError::new("network", e.to_string()))?;
    let get = |url: &'static str| {
        let c = c.clone();
        async move { c.get(url).send().await.ok()?.text().await.ok() }
    };
    let (o, l) = tokio::join!(get("http://127.0.0.1:11434/api/tags"), get("http://127.0.0.1:1234/v1/models"));
    Ok(LocalProbe { ollama: o.as_deref().and_then(ollama_models), lmstudio: l.as_deref().and_then(openai_models) })
}
