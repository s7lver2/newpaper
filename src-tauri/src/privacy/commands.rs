use std::sync::Arc;

use np_adblock::{
    lists::ListCache,
    service::{adblock_status as compute_adblock_status, AdblockService, AdblockStatus},
    stats::today_local,
    updater::{refresh_lists, RefreshReport},
};
use np_net::{NetController, NetMode, NetStatus};
use np_shell::{extensions::ShellExtensions, TabId, TabManager};
use np_store::Store;
use serde::Serialize;
use tauri::State;

use super::{adapters::NetProfiles, rebuild_blocker, settings, ShellFetcher};
use crate::error::{CmdError, CmdResult};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrivacyStatus {
    #[serde(flatten)]
    pub net: NetStatus,
    pub tabs_without_tor: Vec<TabId>,
}

impl PrivacyStatus {
    pub fn new(net: NetStatus, tabs_without_tor: Vec<TabId>) -> Self {
        Self { net, tabs_without_tor }
    }
}

fn status(net: &NetController, profiles: &NetProfiles) -> PrivacyStatus {
    PrivacyStatus::new(net.status(), profiles.without_tor())
}

fn net_err(e: np_net::NetError) -> CmdError {
    CmdError::new("net", e.to_string())
}

#[tauri::command]
pub async fn privacy_status(net: State<'_, Arc<NetController>>, profiles: State<'_, Arc<NetProfiles>>) -> CmdResult<PrivacyStatus> {
    Ok(status(&net, &profiles))
}

#[tauri::command]
pub async fn net_set_mode(
    net: State<'_, Arc<NetController>>,
    profiles: State<'_, Arc<NetProfiles>>,
    store: State<'_, Arc<Store>>,
    tabs: State<'_, Arc<TabManager>>,
    mode: NetMode,
) -> CmdResult<PrivacyStatus> {
    if net.set_mode(mode) {
        settings::save_net_settings(&store, &net.settings())?;
        tabs.recreate_all_content_webviews().await?;
    }
    Ok(status(&net, &profiles))
}

#[tauri::command]
pub async fn tor_set_exit_country(
    net: State<'_, Arc<NetController>>,
    profiles: State<'_, Arc<NetProfiles>>,
    store: State<'_, Arc<Store>>,
    tabs: State<'_, Arc<TabManager>>,
    country: Option<String>,
) -> CmdResult<PrivacyStatus> {
    if net.set_exit_country(country).map_err(net_err)? {
        settings::save_net_settings(&store, &net.settings())?;
        if net.settings().mode == NetMode::Tor {
            tabs.recreate_all_content_webviews().await?;
        }
    }
    Ok(status(&net, &profiles))
}

#[tauri::command]
pub async fn tor_new_circuit(
    net: State<'_, Arc<NetController>>,
    profiles: State<'_, Arc<NetProfiles>>,
    tabs: State<'_, Arc<TabManager>>,
    tab_id: Option<TabId>,
) -> CmdResult<PrivacyStatus> {
    net.new_circuit();
    if let Some(id) = tab_id.or(tabs.snapshot().active_id) {
        tabs.recreate_tab(id).await?;
    }
    Ok(status(&net, &profiles))
}

#[tauri::command]
pub async fn privacy_set_routing(
    net: State<'_, Arc<NetController>>,
    profiles: State<'_, Arc<NetProfiles>>,
    store: State<'_, Arc<Store>>,
    ai_via_tor: Option<bool>,
    feeds_via_tor: Option<bool>,
) -> CmdResult<PrivacyStatus> {
    if net.set_routing(ai_via_tor, feeds_via_tor) {
        settings::save_net_settings(&store, &net.settings())?;
    }
    Ok(status(&net, &profiles))
}

/// Acción explícita del usuario (la UI muestra antes un aviso): la pestaña sale por conexión directa.
#[tauri::command]
pub async fn tab_without_tor(
    net: State<'_, Arc<NetController>>,
    profiles: State<'_, Arc<NetProfiles>>,
    tabs: State<'_, Arc<TabManager>>,
    tab_id: TabId,
) -> CmdResult<PrivacyStatus> {
    profiles.mark_without_tor(tab_id);
    tabs.recreate_tab(tab_id).await?;
    Ok(status(&net, &profiles))
}

#[tauri::command]
pub async fn adblock_status(svc: State<'_, Arc<AdblockService>>, cache: State<'_, Arc<ListCache>>) -> CmdResult<AdblockStatus> {
    Ok(compute_adblock_status(&cache, &svc.settings()))
}

#[tauri::command]
pub async fn adblock_set_enabled(
    svc: State<'_, Arc<AdblockService>>,
    cache: State<'_, Arc<ListCache>>,
    store: State<'_, Arc<Store>>,
    enabled: bool,
) -> CmdResult<AdblockStatus> {
    svc.set_enabled(enabled);
    settings::save_adblock_settings(&store, &svc.settings())?;
    Ok(compute_adblock_status(&cache, &svc.settings()))
}

#[tauri::command]
pub async fn adblock_set_list(
    svc: State<'_, Arc<AdblockService>>,
    cache: State<'_, Arc<ListCache>>,
    store: State<'_, Arc<Store>>,
    id: String,
    enabled: bool,
) -> CmdResult<AdblockStatus> {
    if svc.set_list_enabled(&id, enabled).map_err(|e| CmdError::new("adblock_list", e))? {
        settings::save_adblock_settings(&store, &svc.settings())?;
        rebuild_blocker(svc.inner().clone(), cache.inner().clone());
    }
    Ok(compute_adblock_status(&cache, &svc.settings()))
}

#[tauri::command]
pub async fn adblock_refresh(
    svc: State<'_, Arc<AdblockService>>,
    cache: State<'_, Arc<ListCache>>,
    ext: State<'_, Arc<ShellExtensions>>,
) -> CmdResult<RefreshReport> {
    let report = refresh_lists(&cache, &ShellFetcher(ext.inner().clone()), &svc.settings().lists, chrono::Utc::now().timestamp(), true).await;
    if !report.updated.is_empty() {
        rebuild_blocker(svc.inner().clone(), cache.inner().clone());
    }
    Ok(report)
}

#[derive(Serialize)]
pub struct BlockedCounts {
    pub tab: u64,
    pub today: u64,
}

#[tauri::command]
pub async fn blocked_counts(svc: State<'_, Arc<AdblockService>>, store: State<'_, Arc<Store>>, tab_id: Option<TabId>) -> CmdResult<BlockedCounts> {
    let today = store.with_conn(|c| svc.stats().day_total(c, &today_local()))?;
    Ok(BlockedCounts { tab: tab_id.map(|t| svc.stats().tab_count(t)).unwrap_or(0), today })
}
