use std::{sync::Arc, time::Duration};

use np_net::{NetController, NetMode, TorState};
use np_shell::extensions::{HttpPurpose, ShellExtensions};
use np_store::Store;
use np_update::channels::{installer_url, manifest_url, Channel};
use serde::Serialize;
use tauri::{App, AppHandle, Emitter, Manager, State, Url};
use tauri_plugin_updater::{Update, UpdaterExt};
use tokio::sync::Mutex;

use super::{rollback_installer, SystemState};
use crate::error::{CmdError, CmdResult};

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "state", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum UpdateStatus {
    Idle,
    Checking,
    UpToDate { checked_at: i64 },
    Downloading { version: String, received: u64, total: Option<u64> },
    Ready { version: String, notes: Option<String>, date: Option<String> },
    TorUnavailable,
    Error { message: String },
}

#[derive(Default)]
pub struct UpdaterState {
    pub status: std::sync::Mutex<Option<UpdateStatus>>,
    pub ready: Mutex<Option<(Update, Vec<u8>)>>,
    pub running: Mutex<()>,
}

fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn set(app: &AppHandle, s: UpdateStatus) {
    *app.state::<Arc<UpdaterState>>().status.lock().expect("lock") = Some(s.clone());
    let _ = app.emit_to("ui", "update://status", s);
}

fn channel(store: &Store) -> Channel {
    Channel::parse(&store.get_setting::<String>("device.updates.channel").ok().flatten().unwrap_or_default())
}

fn updater_pubkey(app: &AppHandle) -> Option<String> {
    app.config().plugins.0.get("updater").and_then(|v| v.get("pubkey")).and_then(|v| v.as_str()).map(str::to_string)
}

/// Guarda el instalador firmado de la versión actual para poder volver atrás (§17).
async fn keep_rollback_installer(app: &AppHandle) -> Result<(), String> {
    let sys = app.state::<Arc<SystemState>>();
    let path = rollback_installer(&sys.data_dir, &sys.version);
    if path.exists() {
        return Ok(());
    }
    let client = app.state::<Arc<ShellExtensions>>().http_client(HttpPurpose::Updates)?;
    let url = installer_url(&sys.version);
    let bytes = client.get(&url).send().await.map_err(|e| e.to_string())?.error_for_status().map_err(|e| e.to_string())?.bytes().await.map_err(|e| e.to_string())?;
    let sig_b64 = client.get(format!("{url}.sig")).send().await.map_err(|e| e.to_string())?.error_for_status().map_err(|e| e.to_string())?.text().await.map_err(|e| e.to_string())?;
    let pubkey = np_update::sig::decode_tauri(&updater_pubkey(app).ok_or("missing updater pubkey")?).map_err(|e| e.to_string())?;
    let signature = np_update::sig::decode_tauri(&sig_b64).map_err(|e| e.to_string())?;
    np_update::sig::verify(&pubkey, &bytes, &signature).map_err(|e| e.to_string())?; // nunca sin firma válida
    let dir = path.parent().ok_or("rollback path without parent")?.to_path_buf();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    // Solo se conserva un instalador de vuelta atrás.
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for e in entries.flatten() {
            if e.path() != path {
                let _ = std::fs::remove_file(e.path());
            }
        }
    }
    Ok(())
}

pub async fn check(app: AppHandle) {
    let st = app.state::<Arc<UpdaterState>>().inner().clone();
    let Ok(_guard) = st.running.try_lock() else { return };
    if st.ready.lock().await.is_some() {
        return;
    }
    let net = app.state::<Arc<NetController>>().inner().clone();
    let store = app.state::<Arc<Store>>().inner().clone();
    let sys = app.state::<Arc<SystemState>>().inner().clone();
    let status = net.status();
    let url = match Url::parse(manifest_url(channel(&store))) {
        Ok(u) => u,
        Err(e) => return set(&app, UpdateStatus::Error { message: e.to_string() }),
    };
    let mut builder = match app.updater_builder().endpoints(vec![url]) {
        Ok(b) => b.timeout(Duration::from_secs(120)),
        Err(e) => return set(&app, UpdateStatus::Error { message: e.to_string() }),
    };
    if status.mode == NetMode::Tor {
        if !matches!(status.tor, TorState::Ready) {
            return set(&app, UpdateStatus::TorUnavailable); // nunca se cae a directo (§4.2)
        }
        let proxy = match Url::parse(&format!("socks5h://127.0.0.1:{}", net.socks_port())) {
            Ok(p) => p,
            Err(e) => return set(&app, UpdateStatus::Error { message: e.to_string() }),
        };
        builder = builder.proxy(proxy);
    }
    let skipped = sys.boot.lock().expect("lock").state().skipped.clone();
    builder = builder.version_comparator(move |current, remote| remote.version > current && !skipped.contains(&remote.version.to_string()));
    set(&app, UpdateStatus::Checking);
    let updater = match builder.build() {
        Ok(u) => u,
        Err(e) => return set(&app, UpdateStatus::Error { message: e.to_string() }),
    };
    match updater.check().await {
        Ok(None) => set(&app, UpdateStatus::UpToDate { checked_at: now() }),
        Err(e) => set(&app, UpdateStatus::Error { message: e.to_string() }),
        Ok(Some(update)) => {
            let version = update.version.clone();
            let app2 = app.clone();
            let mut received = 0u64;
            let bytes = update
                .download(
                    |chunk, total| {
                        received += chunk as u64;
                        set(&app2, UpdateStatus::Downloading { version: version.clone(), received, total });
                    },
                    || {},
                )
                .await;
            let bytes = match bytes {
                Ok(b) => b,
                Err(e) => return set(&app, UpdateStatus::Error { message: e.to_string() }),
            };
            if let Err(e) = keep_rollback_installer(&app).await {
                tracing::warn!(error = %e, "could not keep rollback installer; update postponed");
                return set(&app, UpdateStatus::Error { message: e });
            }
            let notes = update.body.clone();
            if let Some(n) = &notes {
                let _ = std::fs::write(sys.data_dir.join("updates").join(format!("notes-{version}.md")), n);
            }
            let date = update.date.map(|d| d.to_string());
            *st.ready.lock().await = Some((update, bytes));
            set(&app, UpdateStatus::Ready { version, notes, date });
        }
    }
}

/// Instala la actualización descargada. En Windows la app se cierra y el instalador la vuelve a abrir.
pub async fn install(app: &AppHandle) -> Result<(), String> {
    let st = app.state::<Arc<UpdaterState>>().inner().clone();
    let Some((update, bytes)) = st.ready.lock().await.take() else { return Err("no update ready".into()) };
    let sys = app.state::<Arc<SystemState>>();
    {
        let mut g = sys.boot.lock().expect("lock");
        g.record_update(&sys.version, &update.version);
        g.save().map_err(|e| e.to_string())?;
    }
    update.install(bytes).map_err(|e| e.to_string())
}

pub fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    app.manage(Arc::new(UpdaterState::default()));
    let handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(30)).await;
        loop {
            check(handle.clone()).await;
            tokio::time::sleep(Duration::from_secs(24 * 3600)).await;
        }
    });
    Ok(())
}

/// `RunEvent::ExitRequested`: si hay actualización lista, se aplica al cerrar (§17 "aplicación al reiniciar").
pub fn on_exit(app: &AppHandle) {
    let st = app.state::<Arc<UpdaterState>>().inner().clone();
    if st.ready.try_lock().is_ok_and(|g| g.is_some()) {
        let _ = tauri::async_runtime::block_on(install(app));
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WhatsNew {
    pub version: String,
    pub notes: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub status: UpdateStatus,
    pub current: String,
    pub channel: Channel,
    pub whats_new: Option<WhatsNew>,
}

#[tauri::command]
pub async fn update_status(st: State<'_, Arc<UpdaterState>>, sys: State<'_, Arc<SystemState>>, store: State<'_, Arc<Store>>) -> CmdResult<UpdateInfo> {
    let seen = store.get_setting::<String>("device.updates.notesSeen").ok().flatten();
    let notes_path = sys.data_dir.join("updates").join(format!("notes-{}.md", sys.version));
    let whats_new = if seen.as_deref() != Some(sys.version.as_str()) {
        std::fs::read_to_string(&notes_path).ok().map(|notes| WhatsNew { version: sys.version.clone(), notes })
    } else {
        None
    };
    let status = st.status.lock().expect("lock").clone().unwrap_or(UpdateStatus::Idle);
    Ok(UpdateInfo { status, current: sys.version.clone(), channel: channel(&store), whats_new })
}

#[tauri::command]
pub async fn update_check(app: AppHandle) -> CmdResult<()> {
    tauri::async_runtime::spawn(check(app));
    Ok(())
}

#[tauri::command]
pub async fn update_install_now(app: AppHandle) -> CmdResult<()> {
    install(&app).await.map_err(|e| CmdError::new("update", e))
}

#[tauri::command]
pub async fn update_set_channel(app: AppHandle, store: State<'_, Arc<Store>>, channel: Channel) -> CmdResult<()> {
    store.set_setting("device.updates.channel", &channel)?;
    tauri::async_runtime::spawn(check(app));
    Ok(())
}

#[tauri::command]
pub async fn update_ack_notes(sys: State<'_, Arc<SystemState>>, store: State<'_, Arc<Store>>) -> CmdResult<()> {
    store.set_setting("device.updates.notesSeen", &sys.version)?;
    Ok(())
}
