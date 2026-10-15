//! Subproyecto 6: arranque, actualizaciones de app y contenido, primer arranque y páginas del sistema.
#[cfg(desktop)]
pub mod commands;
pub mod content;
#[cfg(desktop)]
pub mod firstrun;
#[cfg(desktop)]
pub mod updater;

#[cfg(desktop)]
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};

#[cfg(desktop)]
use np_update::boot::{BootDecision, BootGuard};
#[cfg(desktop)]
use tauri::{App, AppHandle, Emitter, Manager};

#[cfg(desktop)]
pub struct SystemState {
    pub boot: Mutex<BootGuard>,
    pub pending_urls: Mutex<Vec<String>>,
    pub version: String,
    pub data_dir: PathBuf,
}

#[cfg(desktop)]
fn http_urls<'a>(args: impl Iterator<Item = &'a String>) -> Vec<String> {
    args.filter(|a| a.starts_with("http://") || a.starts_with("https://")).cloned().collect()
}

#[cfg(desktop)]
pub fn rollback_installer(data_dir: &std::path::Path, version: &str) -> PathBuf {
    data_dir.join("updates").join("rollback").join(format!("newpaper_{version}_x64-setup.exe"))
}

#[cfg(desktop)]
/// Primera llamada de `setup` (antes de crear ventanas): cuenta el arranque y, si procede, vuelve atrás.
pub fn boot_check(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let data_dir = app.path().app_local_data_dir()?;
    let version = app.package_info().version.to_string();
    let mut guard = BootGuard::open(&data_dir.join("updates").join("boot.json"))?;
    let decision = guard.on_start(&version);
    guard.save()?;
    if let BootDecision::Rollback { to_version } = decision {
        let installer = rollback_installer(&data_dir, &to_version);
        if installer.exists() {
            tracing::warn!(%version, %to_version, "rolling back after repeated failed starts");
            // `/P`: instalación pasiva del NSIS de Tauri (barra de progreso, sin preguntas).
            std::process::Command::new(&installer).arg("/P").spawn()?;
            std::process::exit(0);
        }
        tracing::error!(%to_version, "rollback installer missing; continuing");
    }
    let urls = http_urls(std::env::args().collect::<Vec<_>>().iter().skip(1));
    app.manage(Arc::new(SystemState { boot: Mutex::new(guard), pending_urls: Mutex::new(urls), version, data_dir }));
    Ok(())
}

#[cfg(desktop)]
pub fn on_second_instance(app: &AppHandle, argv: Vec<String>) {
    for url in http_urls(argv.iter().skip(1)) {
        let _ = app.emit_to("ui", "app://open-url", url);
    }
    if let Some(w) = app.get_window("main") {
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

/// Tareas de fondo del sistema (actualizaciones de app y contenido).
#[cfg(desktop)]
pub fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    updater::setup(app)?;
    content::setup(app)?;
    firstrun::setup(app)?;
    Ok(())
}
