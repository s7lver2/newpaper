//! Aviso de consumo excesivo de recursos: mide la memoria de la app y de sus procesos WebView2 cada
//! pocos segundos y avisa a la UI (evento `app://resources`). No cierra nada por su cuenta.
use std::{
    sync::{Arc, Mutex},
    time::Instant,
};

use np_shell::{
    model::TabKind,
    resources::{limit_mib, Event, HeavyTab, Monitor, ResourceEvent, DEFAULT_SNOOZE, MIB, SAMPLE_EVERY},
    TabManager,
};
use np_store::Store;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::error::CmdResult;

pub struct ResourceState {
    monitor: Mutex<Monitor>,
}

#[cfg(windows)]
fn measure() -> (u64, u64) {
    (np_shell::sysmem::process_tree_bytes() / MIB, np_shell::sysmem::total_physical_bytes())
}

#[cfg(not(windows))]
fn measure() -> (u64, u64) {
    (0, 0)
}

/// Ajuste `resources.limitMb` (0 = automático); en desarrollo `NP_TEST_RESOURCE_LIMIT_MB` lo fuerza.
fn configured_limit(store: &Store) -> u64 {
    if cfg!(debug_assertions) {
        if let Some(v) = std::env::var("NP_TEST_RESOURCE_LIMIT_MB").ok().and_then(|v| v.parse::<u64>().ok()) {
            return v.max(1);
        }
    }
    store.get_setting::<u64>("resources.limitMb").ok().flatten().unwrap_or(0)
}

fn closable(tabs: &TabManager) -> Vec<HeavyTab> {
    let snap = tabs.snapshot();
    snap.tabs
        .iter()
        .filter(|t| t.kind == TabKind::Web && !t.pinned && snap.active_id != Some(t.id))
        .map(|t| HeavyTab { tab_id: t.id, title: t.title.clone() })
        .collect()
}

fn event(level: &'static str, used: u64, limit: u64, total: u64, tabs: &TabManager) -> ResourceEvent {
    ResourceEvent { level, used_mib: used, limit_mib: limit, total_mib: total / MIB, closable: closable(tabs) }
}

pub fn setup(app: &tauri::App) {
    let state = Arc::new(ResourceState { monitor: Mutex::new(Monitor::new()) });
    app.manage(state.clone());
    let handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        // Primera medida a los 20 s: el arranque no cuenta.
        tokio::time::sleep(std::time::Duration::from_secs(20)).await;
        loop {
            tick(&handle, &state);
            tokio::time::sleep(SAMPLE_EVERY).await;
        }
    });
}

fn tick(app: &AppHandle, state: &ResourceState) {
    let store = app.state::<Arc<Store>>();
    let tabs = app.state::<Arc<TabManager>>();
    let enabled = store.get_setting::<bool>("resources.warn").ok().flatten().unwrap_or(true);
    let (used, total) = measure();
    let limit = limit_mib(configured_limit(&store), total);
    let ev = state.monitor.lock().expect("monitor lock").evaluate(used, limit, enabled, Instant::now());
    match ev {
        Some(Event::Warn) => {
            tracing::warn!(used_mib = used, limit_mib = limit, "memory above the warning limit");
            let _ = app.emit_to("ui", "app://resources", event("warn", used, limit, total, &tabs));
        }
        Some(Event::Clear) => {
            let _ = app.emit_to("ui", "app://resources", event("ok", used, limit, total, &tabs));
        }
        None => {}
    }
}

/// Medida actual (para Ajustes y pruebas).
#[tauri::command]
pub async fn resources_status(store: State<'_, Arc<Store>>, tabs: State<'_, Arc<TabManager>>) -> CmdResult<ResourceEvent> {
    let (used, total) = measure();
    let limit = limit_mib(configured_limit(&store), total);
    Ok(event(if used >= limit { "warn" } else { "ok" }, used, limit, total, &tabs))
}

/// "Ahora no": no se vuelve a avisar en un rato.
#[tauri::command]
pub async fn resources_snooze(state: State<'_, Arc<ResourceState>>, minutes: Option<u64>) -> CmdResult<()> {
    let dur = minutes.map_or(DEFAULT_SNOOZE, |m| std::time::Duration::from_secs(m.clamp(1, 24 * 60) * 60));
    state.monitor.lock().expect("monitor lock").snooze(Instant::now(), dur);
    Ok(())
}

/// Acción explícita del usuario: cierra las pestañas web en segundo plano que no estén ancladas.
#[tauri::command]
pub async fn resources_close_background(tabs: State<'_, Arc<TabManager>>) -> CmdResult<usize> {
    let ids: Vec<u64> = closable(&tabs).into_iter().map(|t| t.tab_id).collect();
    for id in &ids {
        tabs.close(*id).await?;
    }
    Ok(ids.len())
}

/// Acción explícita del usuario: cierra la aplicación.
#[tauri::command]
pub fn app_exit(app: AppHandle) {
    app.exit(0);
}
