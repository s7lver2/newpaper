//! Servicio de sincronización de la app: escucha TCP solo si está activada, mDNS y sincronización periódica.
use std::{sync::Arc, time::Duration};

use np_store::{secrets::SecretStore, Store};
use np_sync::{
    discovery::{local_addresses, Discovery, DEFAULT_PORT},
    identity::{fingerprint, Identity},
    pairing::{PairingManager, PairingOffer},
    peers::{self, Peer},
    session::{pair_with, serve, sync_with, SyncContext, SyncReport},
};
use serde::Serialize;
use tauri::{App, AppHandle, Emitter, Manager};
use tokio::{net::TcpStream, sync::Mutex, task::JoinHandle, time::timeout};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LastSync {
    pub at: i64,
    pub peer_name: String,
    pub sent: usize,
    pub received: usize,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    pub enabled: bool,
    pub listening: bool,
    pub device_id: String,
    pub name: String,
    pub fingerprint: String,
    pub addresses: Vec<String>,
    pub visible: Vec<String>,
    pub last: Option<LastSync>,
}

pub struct SyncService {
    pub ctx: Arc<SyncContext>,
    app: AppHandle,
    listener: Mutex<Option<JoinHandle<()>>>,
    discovery: std::sync::Mutex<Option<Discovery>>,
    last: std::sync::Mutex<Option<LastSync>>,
    busy: Mutex<()>,
}

fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

impl SyncService {
    fn enabled(&self) -> bool {
        self.ctx.store.get_setting::<bool>("device.sync.enabled").ok().flatten().unwrap_or(false)
    }

    pub fn status(&self) -> SyncStatus {
        SyncStatus {
            enabled: self.enabled(),
            listening: self.discovery.lock().expect("lock").is_some(),
            device_id: self.ctx.identity.device_id.clone(),
            name: self.ctx.identity.name.clone(),
            fingerprint: fingerprint(&self.ctx.identity.public()),
            addresses: local_addresses(DEFAULT_PORT),
            visible: self.discovery.lock().expect("lock").as_ref().map(|d| d.visible()).unwrap_or_default(),
            last: self.last.lock().expect("lock").clone(),
        }
    }

    fn emit(&self) {
        let _ = self.app.emit_to("ui", "sync://status", self.status());
    }

    /// Solo con la sincronización activada: escucha TCP directo (nunca Tor) y se anuncia por mDNS.
    pub async fn start(self: &Arc<Self>) -> Result<(), String> {
        if self.listener.lock().await.is_some() {
            return Ok(());
        }
        let listener = tokio::net::TcpListener::bind(("0.0.0.0", DEFAULT_PORT)).await.map_err(|e| e.to_string())?;
        let me = self.clone();
        let handle = tokio::spawn(async move {
            while let Ok((mut stream, addr)) = listener.accept().await {
                let me = me.clone();
                tokio::spawn(async move {
                    let r = timeout(Duration::from_secs(120), serve(&mut stream, &me.ctx)).await;
                    match r {
                        Ok(Ok(rep)) => {
                            if rep.paired {
                                let _ = me.app.emit_to("ui", "sync://paired", serde_json::json!({ "peerId": rep.peer_id, "name": rep.peer_name }));
                            }
                            me.record(&rep, None);
                        }
                        Ok(Err(e)) => tracing::info!(%addr, error = %e, "sync session refused or failed"),
                        Err(_) => tracing::info!(%addr, "sync session timed out"),
                    }
                });
            }
        });
        *self.listener.lock().await = Some(handle);
        let d = Discovery::start(&self.ctx.identity, DEFAULT_PORT, true).map_err(|e| e.to_string())?;
        *self.discovery.lock().expect("lock") = Some(d);
        self.emit();
        Ok(())
    }

    pub async fn stop(&self) {
        if let Some(h) = self.listener.lock().await.take() {
            h.abort();
        }
        if let Some(d) = self.discovery.lock().expect("lock").take() {
            d.stop();
        }
        self.emit();
    }

    fn record(&self, rep: &SyncReport, error: Option<String>) {
        *self.last.lock().expect("lock") = Some(LastSync { at: now(), peer_name: rep.peer_name.clone(), sent: rep.sent, received: rep.received, error });
        self.emit();
    }

    fn candidates(&self, peer: &Peer) -> Vec<String> {
        let mut out = self.discovery.lock().expect("lock").as_ref().map(|d| d.addresses_of(&peer.id)).unwrap_or_default();
        out.extend(peer.addresses.iter().cloned());
        out.dedup();
        out
    }

    pub async fn sync_peer(&self, peer: &Peer) -> Result<SyncReport, String> {
        let mut last_err = "no address".to_string();
        for addr in self.candidates(peer) {
            match timeout(Duration::from_secs(3), TcpStream::connect(&addr)).await {
                Ok(Ok(mut s)) => match timeout(Duration::from_secs(120), sync_with(&mut s, &self.ctx, peer)).await {
                    Ok(Ok(rep)) => {
                        self.record(&rep, None);
                        return Ok(rep);
                    }
                    Ok(Err(e)) => last_err = e.to_string(),
                    Err(_) => last_err = "timeout".into(),
                },
                Ok(Err(e)) => last_err = e.to_string(),
                Err(_) => last_err = "connect timeout".into(),
            }
        }
        let _ = peers::set_error(&self.ctx.store, &peer.id, Some(&last_err));
        Err(last_err)
    }

    pub async fn sync_all(&self) -> Vec<Result<SyncReport, String>> {
        let Ok(_g) = self.busy.try_lock() else { return vec![] };
        let list = peers::list(&self.ctx.store).unwrap_or_default();
        let mut out = Vec::new();
        for p in list.into_iter().filter(|p| !p.revoked) {
            out.push(self.sync_peer(&p).await);
        }
        out
    }

    /// Emparejar pegando el código `np1:` (escritorio ↔ escritorio) o desde el escáner del móvil.
    pub async fn pair_with_code(&self, code: &str) -> Result<Peer, String> {
        let offer = PairingOffer::decode(code).map_err(|e| e.to_string())?;
        let mut last_err = "no address".to_string();
        for addr in &offer.addrs {
            if let Ok(Ok(mut s)) = timeout(Duration::from_secs(3), TcpStream::connect(addr)).await {
                match timeout(Duration::from_secs(30), pair_with(&mut s, &self.ctx, &offer)).await {
                    Ok(Ok(peer)) => {
                        let _ = self.app.emit_to("ui", "sync://paired", serde_json::json!({ "peerId": peer.id, "name": peer.name }));
                        let _ = self.sync_peer(&peer).await;
                        return Ok(peer);
                    }
                    Ok(Err(e)) => last_err = e.to_string(),
                    Err(_) => last_err = "timeout".into(),
                }
            }
        }
        Err(last_err)
    }
}

pub fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let store = app.state::<Arc<Store>>().inner().clone();
    let secrets = app.state::<Arc<dyn SecretStore>>().inner().clone();
    let name = store
        .get_setting::<String>("device.name")?
        .unwrap_or_else(|| std::env::var("COMPUTERNAME").unwrap_or_else(|_| "newpaper".into()));
    // Si el llavero no responde, la app arranca igual con una identidad temporal (los pares se pierden al cerrar).
    let identity = Arc::new(match Identity::load_or_create(secrets.as_ref(), &name) {
        Ok(id) => id,
        Err(e) => {
            tracing::warn!(error = %e, "sync identity unavailable; using a session-only identity");
            Identity::generate(&name)
        }
    });
    let ctx = Arc::new(SyncContext { store, identity, secrets, pairing: Arc::new(PairingManager::new()) });
    let svc = Arc::new(SyncService {
        ctx,
        app: app.handle().clone(),
        listener: Mutex::new(None),
        discovery: std::sync::Mutex::new(None),
        last: std::sync::Mutex::new(None),
        busy: Mutex::new(()),
    });
    app.manage(svc.clone());
    tauri::async_runtime::spawn(async move {
        if svc.enabled() {
            if let Err(e) = svc.start().await {
                tracing::warn!(error = %e, "sync listener not started");
            }
            tokio::time::sleep(Duration::from_secs(10)).await; // al abrir
        }
        loop {
            if svc.enabled() {
                svc.sync_all().await;
            }
            tokio::time::sleep(Duration::from_secs(300)).await; // cada 5 minutos
        }
    });
    Ok(())
}
