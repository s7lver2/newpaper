//! Subproyecto 2: bloqueo y red.
pub mod adapters;
pub mod commands;
pub mod settings;

use std::{sync::Arc, time::Duration};

use async_trait::async_trait;
use np_adblock::{
    cosmetic_msg::COSMETIC_SCRIPT,
    lists::ListCache,
    service::{build_blocker, AdblockService},
    stats::today_local,
    updater::{refresh_lists, ListFetcher},
};
use np_net::{fake::FakeTor, server::TorBackend, tor::ArtiTor, NetController};
use np_shell::extensions::{HttpPurpose, ShellExtensions};
use np_store::Store;
use tauri::{App, AppHandle, Emitter, Manager};

use adapters::{AdblockHook, CosmeticHandler, NetHttp, NetProfiles, UiNotifier};

/// Descargas de listas: siguen el modo de red (por Tor si está activo).
pub(crate) struct ShellFetcher(pub Arc<ShellExtensions>);

#[async_trait]
impl ListFetcher for ShellFetcher {
    async fn fetch(&self, url: &str) -> Result<String, String> {
        let client = self.0.http_client(HttpPurpose::Content)?;
        let resp = client.get(url).send().await.map_err(|e| e.to_string())?;
        if !resp.status().is_success() {
            return Err(format!("HTTP {}", resp.status()));
        }
        resp.text().await.map_err(|e| e.to_string())
    }
}

fn extra_rules() -> Option<String> {
    if cfg!(debug_assertions) {
        std::env::var("NP_TEST_EXTRA_RULES").ok()
    } else {
        None
    }
}

/// Reconstruye el motor en un hilo bloqueante (≈1 s con las 7 listas) y lo instala al terminar.
pub fn rebuild_blocker(svc: Arc<AdblockService>, cache: Arc<ListCache>) {
    tauri::async_runtime::spawn_blocking(move || {
        let settings = svc.settings();
        let blocker = build_blocker(&cache, &settings, extra_rules().as_deref());
        svc.install_blocker(blocker);
        tracing::info!(lists = settings.lists.len(), "adblock engine rebuilt");
    });
}

fn tor_backend(app: &App) -> Result<Arc<dyn TorBackend>, Box<dyn std::error::Error>> {
    if cfg!(debug_assertions) && std::env::var("NP_FAKE_TOR").is_ok() {
        tracing::warn!("using simulated Tor (NP_FAKE_TOR)");
        return Ok(FakeTor::new(true));
    }
    let base = app.path().app_local_data_dir()?.join("tor");
    Ok(ArtiTor::new(base.join("state"), base.join("cache")))
}

pub fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let store = app.state::<Arc<Store>>().inner().clone();
    let ext = app.state::<Arc<ShellExtensions>>().inner().clone();
    let data = app.path().app_local_data_dir()?;

    // --- Bloqueo ---
    let svc = Arc::new(AdblockService::new(settings::load_adblock_settings(&store)?, Arc::new(UiNotifier::new(app.handle().clone()))));
    let cache = Arc::new(ListCache::new(data.join("filter-lists")));
    rebuild_blocker(svc.clone(), cache.clone());

    // --- Red ---
    let net = tauri::async_runtime::block_on(NetController::start(settings::load_net_settings(&store)?, tor_backend(app)?))?;
    let profiles = Arc::new(NetProfiles::new(net.clone()));
    ext.set_profile_provider(profiles.clone());
    ext.set_http_provider(Arc::new(NetHttp(net.clone())));
    ext.add_hook(Arc::new(AdblockHook { svc: svc.clone() }));
    ext.add_message_handler(Arc::new(CosmeticHandler(svc.clone())));
    ext.add_init_script(COSMETIC_SCRIPT.to_string());

    spawn_status_forwarder(app.handle().clone(), net.clone(), profiles.clone());
    spawn_stats_flush(app.handle().clone(), store, svc.clone());
    spawn_list_refresher(ext, svc.clone(), cache.clone());

    app.manage(svc);
    app.manage(cache);
    app.manage(net);
    app.manage(profiles);
    Ok(())
}

fn spawn_status_forwarder(app: AppHandle, net: Arc<NetController>, profiles: Arc<NetProfiles>) {
    tauri::async_runtime::spawn(async move {
        let mut rx = net.subscribe();
        loop {
            let status = commands::PrivacyStatus::new(rx.borrow().clone(), profiles.without_tor());
            let _ = app.emit_to("ui", "net://status", status);
            if rx.changed().await.is_err() {
                break;
            }
        }
    });
}

fn spawn_stats_flush(app: AppHandle, store: Arc<Store>, svc: Arc<AdblockService>) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(5)).await;
            if let Err(e) = store.with_conn(|c| svc.stats().flush(c)) {
                tracing::warn!(error = %e, "blocked stats flush failed");
            }
            let today = store.with_conn(|c| svc.stats().day_total(c, &today_local())).unwrap_or(0);
            let _ = app.emit_to("ui", "adblock://counts", serde_json::json!({ "tabs": svc.stats().tab_counts(), "today": today }));
        }
    });
}

fn spawn_list_refresher(ext: Arc<ShellExtensions>, svc: Arc<AdblockService>, cache: Arc<ListCache>) {
    tauri::async_runtime::spawn(async move {
        // Primer intento a los 20 s (dar tiempo a Tor) y luego cada hora; refresh_lists solo descarga si toca (24 h).
        tokio::time::sleep(Duration::from_secs(20)).await;
        loop {
            let enabled = svc.settings().lists;
            let report = refresh_lists(&cache, &ShellFetcher(ext.clone()), &enabled, chrono::Utc::now().timestamp(), false).await;
            if !report.updated.is_empty() {
                rebuild_blocker(svc.clone(), cache.clone());
            }
            tokio::time::sleep(Duration::from_secs(3600)).await;
        }
    });
}
