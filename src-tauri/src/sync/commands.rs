//! Comandos de sincronización.
use std::{sync::Arc, time::Duration};

use np_sync::{
    discovery::{local_addresses, DEFAULT_PORT},
    identity::{decode_pk, fingerprint},
    npsync::{self, KdfParams},
    peers::{self, Peer},
    rows::Scope,
    session::SyncReport,
};
use serde::Serialize;
use tauri::State;

use super::service::{SyncService, SyncStatus};
use crate::error::{CmdError, CmdResult};

fn e(err: impl ToString) -> CmdError {
    CmdError::new("sync", err.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PeerView {
    #[serde(flatten)]
    pub peer: Peer,
    pub fingerprint: String,
    pub last_error: Option<String>,
}

fn views(svc: &SyncService) -> CmdResult<Vec<PeerView>> {
    let store = &svc.ctx.store;
    peers::list(store)
        .map_err(e)?
        .into_iter()
        .map(|p| {
            let fp = decode_pk(&p.public_key).map(|k| fingerprint(&k)).unwrap_or_default();
            let last_error: Option<String> = store
                .with_conn(|c| c.query_row("SELECT last_error FROM sync_log WHERE peer_id = ?1", [&p.id], |r| r.get(0)))
                .ok()
                .flatten();
            Ok(PeerView { peer: p, fingerprint: fp, last_error })
        })
        .collect()
}

#[tauri::command]
pub async fn sync_status(svc: State<'_, Arc<SyncService>>) -> CmdResult<SyncStatus> {
    Ok(svc.status())
}

#[tauri::command]
pub async fn sync_set_enabled(svc: State<'_, Arc<SyncService>>, enabled: bool) -> CmdResult<SyncStatus> {
    svc.ctx.store.set_setting("device.sync.enabled", &enabled)?;
    if enabled {
        if let Err(err) = svc.start().await {
            svc.ctx.store.set_setting("device.sync.enabled", &false)?; // no se queda "activada" sin escuchar
            return Err(e(err));
        }
        let s = svc.inner().clone();
        tauri::async_runtime::spawn(async move { s.sync_all().await });
    } else {
        svc.stop().await;
    }
    Ok(svc.status())
}

#[tauri::command]
pub async fn sync_set_name(svc: State<'_, Arc<SyncService>>, name: String) -> CmdResult<()> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 40 || name.chars().any(|c| c.is_control()) {
        return Err(CmdError::new("invalid", "name must have 1-40 characters"));
    }
    svc.ctx.store.set_setting("device.name", &name)?;
    svc.ctx.identity.set_name(name); // las ofertas y los saludos siguientes ya usan el nombre nuevo
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairStart {
    pub code: String,
    pub size: usize,
    pub modules: Vec<bool>,
    pub expires_in_secs: u64,
    pub fingerprint: String,
}

#[tauri::command]
pub async fn sync_pair_start(svc: State<'_, Arc<SyncService>>) -> CmdResult<PairStart> {
    // Emparejar necesita escuchar; nunca se activa la sincronización por sorpresa: la persona la enciende antes.
    if !svc.status().enabled || !svc.status().listening {
        return Err(CmdError::new("sync_disabled", "turn on sync before pairing a device"));
    }
    let offer = svc.ctx.pairing.start(&svc.ctx.identity, local_addresses(DEFAULT_PORT), Duration::from_secs(120));
    let (size, modules) = offer.qr_modules();
    Ok(PairStart { code: offer.encode(), size, modules, expires_in_secs: 120, fingerprint: fingerprint(&svc.ctx.identity.public()) })
}

#[tauri::command]
pub async fn sync_pair_cancel(svc: State<'_, Arc<SyncService>>) -> CmdResult<()> {
    svc.ctx.pairing.cancel();
    Ok(())
}

#[tauri::command]
pub async fn sync_pair_with(svc: State<'_, Arc<SyncService>>, code: String) -> CmdResult<Peer> {
    svc.pair_with_code(&code).await.map_err(e)
}

#[tauri::command]
pub async fn sync_peers(svc: State<'_, Arc<SyncService>>) -> CmdResult<Vec<PeerView>> {
    views(&svc)
}

#[tauri::command]
pub async fn sync_peer_update(svc: State<'_, Arc<SyncService>>, peer_id: String, scopes: Vec<Scope>, send_keys: bool, addresses: Vec<String>) -> CmdResult<Vec<PeerView>> {
    // Solo literales ip:puerto (nunca nombres: no hay resolución DNS) y un máximo razonable.
    let addresses: Vec<String> = addresses.into_iter().map(|a| a.trim().to_string()).filter(|a| a.parse::<std::net::SocketAddr>().is_ok()).take(8).collect();
    let mut scopes = scopes;
    scopes.dedup();
    peers::set_scopes(&svc.ctx.store, &peer_id, &scopes, send_keys && scopes.contains(&Scope::Keys)).map_err(e)?;
    peers::set_addresses(&svc.ctx.store, &peer_id, &addresses).map_err(e)?;
    views(&svc)
}

#[tauri::command]
pub async fn sync_revoke(svc: State<'_, Arc<SyncService>>, peer_id: String) -> CmdResult<Vec<PeerView>> {
    peers::revoke(&svc.ctx.store, &peer_id).map_err(e)?;
    views(&svc)
}

#[tauri::command]
pub async fn sync_now(svc: State<'_, Arc<SyncService>>, peer_id: Option<String>) -> CmdResult<Vec<SyncReport>> {
    let results = match peer_id {
        Some(id) => {
            let peer = peers::get(&svc.ctx.store, &id).map_err(e)?.filter(|p| !p.revoked).ok_or_else(|| CmdError::new("sync", "unknown device"))?;
            vec![svc.sync_peer(&peer).await]
        }
        None => svc.sync_all().await,
    };
    let mut ok = Vec::new();
    for r in results {
        match r {
            Ok(rep) => ok.push(rep),
            Err(err) if ok.is_empty() => return Err(e(err)),
            Err(_) => {}
        }
    }
    Ok(ok)
}

#[tauri::command]
pub async fn sync_export(svc: State<'_, Arc<SyncService>>, path: String, passphrase: String, scopes: Vec<Scope>) -> CmdResult<usize> {
    let passphrase = np_sync::zeroize::Zeroizing::new(passphrase);
    if passphrase.chars().count() < 8 {
        return Err(CmdError::new("invalid", "passphrase too short"));
    }
    let store = svc.ctx.store.clone();
    let bytes = tauri::async_runtime::spawn_blocking(move || npsync::export(&store, &scopes, &passphrase, KdfParams::default())).await.map_err(e)?.map_err(e)?;
    std::fs::write(&path, &bytes).map_err(e)?;
    Ok(bytes.len())
}

#[tauri::command]
pub async fn sync_import(svc: State<'_, Arc<SyncService>>, path: String, passphrase: String) -> CmdResult<usize> {
    let passphrase = np_sync::zeroize::Zeroizing::new(passphrase);
    // Un fichero ajeno no debe agotar la memoria: tope de tamaño antes de leerlo.
    if std::fs::metadata(&path).map_err(e)?.len() > npsync::MAX_FILE_BYTES {
        return Err(CmdError::new("invalid", "file too large"));
    }
    let bytes = std::fs::read(&path).map_err(e)?;
    let store = svc.ctx.store.clone();
    let report = tauri::async_runtime::spawn_blocking(move || npsync::import_report(&store, &bytes, &passphrase, Scope::DEFAULT))
        .await
        .map_err(e)?
        .map_err(|err| match err {
            np_sync::SyncError::Crypto => CmdError::new("wrong_passphrase", "wrong passphrase or damaged file"),
            other => e(other),
        })?;
    // Los ajustes importados se aplican en vivo (tema, idioma, lectura), como si se hubieran cambiado a mano.
    for key in &report.settings {
        let _ = svc.ctx.store.notify_setting_changed(key);
    }
    Ok(report.applied)
}
