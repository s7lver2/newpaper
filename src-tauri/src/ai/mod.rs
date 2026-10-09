//! Subproyecto 4: proxy de IA, caché de análisis, consumo y descarga de fuentes primarias.
pub mod commands;

use std::{collections::HashMap, sync::{Arc, RwLock}};

use np_ai_proxy::{proxy::AiProxy, CustomEndpoint, ProviderTable};
use np_store::{secrets::SecretStore, Store};
use serde::Deserialize;
use tauri::{App, Manager};

use crate::config::read_config_text;

pub struct AiConfig {
    /// Dominios de fuentes primarias por idioma de contenidos.
    pub primary_sources: RwLock<HashMap<String, Vec<String>>>,
}

#[derive(Deserialize)]
struct PrimaryEntry {
    #[serde(rename = "dominio")]
    domain: String,
}

pub fn parse_primary_sources(json: &str) -> Result<HashMap<String, Vec<String>>, serde_json::Error> {
    let v: serde_json::Value = serde_json::from_str(json)?;
    let mut out = HashMap::new();
    for l in crate::config::CONTENT_LOCALES {
        if let Some(arr) = v.get(l) {
            let entries: Vec<PrimaryEntry> = serde_json::from_value(arr.clone())?;
            out.insert(l.to_string(), entries.into_iter().map(|e| e.domain).collect());
        }
    }
    Ok(out)
}

pub fn ollama_models(json: &str) -> Option<Vec<String>> {
    let v: serde_json::Value = serde_json::from_str(json).ok()?;
    Some(v.get("models")?.as_array()?.iter().filter_map(|m| m.get("name")?.as_str().map(str::to_string)).collect())
}

pub fn openai_models(json: &str) -> Option<Vec<String>> {
    let v: serde_json::Value = serde_json::from_str(json).ok()?;
    Some(v.get("data")?.as_array()?.iter().filter_map(|m| m.get("id")?.as_str().map(str::to_string)).collect())
}

pub fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle().clone();
    // Si falta `providers.json` la IA queda sin proveedores (la UI lo muestra) en vez de abortar el arranque.
    let table = match read_config_text(&handle, "providers.json")
        .map_err(|e| e.message)
        .and_then(|t| ProviderTable::from_registry_json(&t).map_err(|e| e.to_string()))
    {
        Ok(t) => t,
        Err(e) => {
            tracing::warn!(error = %e, "providers.json unavailable; AI providers disabled");
            ProviderTable::default()
        }
    };
    let secrets = app.state::<Arc<dyn SecretStore>>().inner().clone();
    let proxy = Arc::new(AiProxy::new(table, secrets));
    let store = app.state::<Arc<Store>>().inner().clone();
    if let Some(eps) = store.get_setting::<Vec<CustomEndpoint>>("ai.customEndpoints")? {
        if let Err(e) = proxy.set_custom(&eps) {
            tracing::warn!(error = %e, "ignoring invalid custom AI endpoints");
        }
    }
    let primary = read_config_text(&handle, "primary-sources.json").ok().and_then(|t| parse_primary_sources(&t).ok()).unwrap_or_default();
    app.manage(proxy);
    app.manage(Arc::new(AiConfig { primary_sources: RwLock::new(primary) }));

    let store_purge = store.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            let _ = np_ai_proxy::cache::purge(&store_purge, chrono::Utc::now().timestamp_millis());
            tokio::time::sleep(std::time::Duration::from_secs(24 * 3600)).await;
        }
    });
    Ok(())
}
