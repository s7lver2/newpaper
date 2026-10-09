pub mod commands;
pub mod config;
pub mod error;
pub mod features;
pub mod npimg;
pub mod privacy;
pub mod resources;
pub mod sources;
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
            commands::tabs::tab_pin,
            commands::tabs::tab_group,
            commands::tabs::tab_ungroup,
            commands::tabs::tab_group_update,
            commands::tabs::tab_close_group,
            commands::tabs::tab_navigate,
            commands::tabs::tab_back,
            commands::tabs::tab_forward,
            commands::tabs::tab_reload,
            commands::tabs::tab_set_view,
            commands::tabs::tab_set_bounds,
            commands::tabs::tabs_snapshot,
            commands::tabs::chrome_set_theme,
            commands::tabs::chrome_set_motion,
            resources::resources_status,
            resources::resources_snooze,
            resources::resources_close_background,
            resources::app_exit,
            commands::tabs::ctx_close,
            commands::tabs::overlay_open,
            commands::tabs::ctx_edit,
            commands::tabs::clipboard_text,
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
            privacy::commands::privacy_status,
            privacy::commands::net_set_mode,
            privacy::commands::tor_set_exit_country,
            privacy::commands::tor_new_circuit,
            privacy::commands::privacy_set_routing,
            privacy::commands::tab_without_tor,
            privacy::commands::adblock_status,
            privacy::commands::adblock_set_enabled,
            privacy::commands::adblock_set_list,
            privacy::commands::adblock_refresh,
            privacy::commands::blocked_counts,
            sources::commands::feeds_refresh_now,
            sources::commands::coverage_for,
            sources::commands::events_briefing,
            sources::commands::events_search,
            sources::commands::event_detail,
            sources::commands::outlets_list,
            sources::commands::outlet_override_set,
            sources::commands::outlet_stats_recompute,
            sources::commands::custom_outlets_list,
            sources::commands::custom_outlet_add,
            sources::commands::custom_outlet_remove,
            sources::commands::topics_list,
            sources::commands::topic_set_following,
            sources::commands::watch_add,
            sources::commands::watches_list,
            sources::commands::lexicon_score,
            sources::wayback::wayback_captures,
            sources::wayback::wayback_capture_html,
            sources::wayback::wayback_analyze,
            sources::wayback::wayback_diff,
        ])
        .run(tauri::generate_context!())
        .expect("error while running newpaper");
}
