pub mod commands;
pub mod config;
pub mod error;
pub mod features;
pub mod npimg;
mod setup;

pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();
    tauri::Builder::default()
        .register_asynchronous_uri_scheme_protocol("npimg", npimg::handle)
        .setup(setup::setup)
        .invoke_handler(tauri::generate_handler![
            commands::tabs::tab_open,
            commands::tabs::tab_close,
            commands::tabs::tab_activate,
            commands::tabs::tab_navigate,
            commands::tabs::tab_back,
            commands::tabs::tab_forward,
            commands::tabs::tab_reload,
            commands::tabs::tab_set_view,
            commands::tabs::tab_set_bounds,
            commands::tabs::tabs_snapshot,
            commands::settings::settings_get,
            commands::settings::settings_set,
            commands::settings::settings_list,
            commands::history::history_record_visit,
            commands::history::history_record_search,
            commands::history::history_mark_analyzed,
            commands::history::history_search,
            commands::history::history_delete,
            commands::history::omnibox_suggest,
            commands::secrets::secret_set,
            commands::secrets::secret_has,
            commands::secrets::secret_delete,
            commands::config::config_read,
        ])
        .run(tauri::generate_context!())
        .expect("error while running newpaper");
}
