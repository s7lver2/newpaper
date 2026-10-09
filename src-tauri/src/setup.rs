use std::{sync::Arc, time::Duration};

use np_shell::{
    extensions::ShellExtensions,
    host::{INK_BG, PAPER_BG},
    TabManager,
};
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
    ext.set_page_transition(store.get_setting::<bool>("appearance.pageTransition")?.unwrap_or(true));

    let handle = app.handle().clone();
    let ext_for_obs = ext.clone();
    store.on_setting_change("", move |key, value| {
        if key == "reader.autoOpen" {
            ext_for_obs.set_reader_auto_open(value.as_bool().unwrap_or(true));
        }
        if key == "appearance.pageTransition" {
            ext_for_obs.set_page_transition(value.as_bool().unwrap_or(true));
            if let Some(tabs) = handle.try_state::<Arc<TabManager>>() {
                tabs.sync_transition_flag();
            }
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
    crate::resources::setup(app);

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

/// Fondo inicial según el ajuste de tema (o el tema del sistema): evita el destello blanco de WebView2.
fn initial_background(app: &App, store: &Store) -> (u8, u8, u8) {
    let choice = store.get_setting::<String>("appearance.theme").ok().flatten().unwrap_or_else(|| "system".into());
    let ink = match choice.as_str() {
        "ink" => true,
        "paper" => false,
        _ => app.get_window("main").and_then(|w| w.theme().ok()).is_some_and(|t| t == tauri::Theme::Dark),
    };
    if ink { INK_BG } else { PAPER_BG }
}

fn create_main_window(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let tabs = app.state::<Arc<TabManager>>().inner().clone();
    let store = app.state::<Arc<Store>>().inner().clone();
    let window = WindowBuilder::new(app, "main")
        .title("newpaper")
        .inner_size(1280.0, 820.0)
        .min_inner_size(900.0, 600.0)
        .background_color(tabs.background())
        .build()?;
    let (r, g, b) = initial_background(app, &store);
    tabs.set_background((r, g, b));
    let size = window.inner_size()?.to_logical::<f64>(window.scale_factor()?);
    let ui = window.add_child(
        WebviewBuilder::new("ui", WebviewUrl::App("index.html".into()))
            .additional_browser_args(np_shell::extensions::DEFAULT_BROWSER_ARGS)
            .background_color(tabs.background())
            .auto_resize(),
        LogicalPosition::new(0.0, 0.0),
        LogicalSize::new(size.width, size.height),
    )?;
    #[cfg(windows)]
    np_shell::host::harden_ui(&ui)?;
    #[cfg(not(windows))]
    let _ = ui;
    Ok(())
}
