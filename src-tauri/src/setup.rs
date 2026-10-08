use std::{sync::Arc, time::Duration};

use np_shell::{extensions::ShellExtensions, TabManager};
use np_store::{history::HistoryRepo, secrets::SecretStore, Store};
use tauri::{webview::WebviewBuilder, window::WindowBuilder, App, Emitter, LogicalPosition, LogicalSize, Manager, WebviewUrl};

use crate::config::OutletIndex;

pub fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let data = app.path().app_local_data_dir()?;
    let store = Arc::new(Store::open(data.join("newpaper.sqlite"))?);

    #[cfg(windows)]
    let secrets: Arc<dyn SecretStore> = Arc::new(np_store::secrets::KeyringSecrets::new("newpaper"));
    #[cfg(not(windows))]
    let secrets: Arc<dyn SecretStore> = Arc::new(np_store::secrets::MemorySecrets::default());

    let outlets = Arc::new(OutletIndex::load(app.handle()));
    let ext = Arc::new(ShellExtensions::new());
    ext.set_known_domains(outlets.domains());
    ext.set_reader_auto_open(store.get_setting::<bool>("reader.autoOpen")?.unwrap_or(true));

    let handle = app.handle().clone();
    let ext_for_obs = ext.clone();
    store.on_setting_change("", move |key, value| {
        if key == "reader.autoOpen" {
            ext_for_obs.set_reader_auto_open(value.as_bool().unwrap_or(true));
        }
        let _ = handle.emit_to("ui", "settings://changed", serde_json::json!({ "key": key, "value": value }));
    });

    let tabs = Arc::new(TabManager::new(app.handle().clone(), ext.clone(), data.join("webview")));
    app.manage(store.clone());
    app.manage(secrets);
    app.manage(ext);
    app.manage(tabs);
    app.manage(outlets);

    crate::features::setup_all(app)?;

    spawn_history_retention(store);
    create_main_window(app)?;
    Ok(())
}

fn spawn_history_retention(store: Arc<Store>) {
    tauri::async_runtime::spawn(async move {
        loop {
            let now = chrono::Utc::now().timestamp_millis();
            match HistoryRepo::new(&store).purge_expired(now) {
                Ok(n) if n > 0 => tracing::info!(removed = n, "history retention applied"),
                Ok(_) => {}
                Err(e) => tracing::warn!(error = %e, "history retention failed"),
            }
            tokio::time::sleep(Duration::from_secs(24 * 3600)).await;
        }
    });
}

fn create_main_window(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let window = WindowBuilder::new(app, "main")
        .title("newpaper")
        .inner_size(1280.0, 820.0)
        .min_inner_size(900.0, 600.0)
        .build()?;
    let size = window.inner_size()?.to_logical::<f64>(window.scale_factor()?);
    window.add_child(
        WebviewBuilder::new("ui", WebviewUrl::App("index.html".into())).auto_resize(),
        LogicalPosition::new(0.0, 0.0),
        LogicalSize::new(size.width, size.height),
    )?;
    Ok(())
}
