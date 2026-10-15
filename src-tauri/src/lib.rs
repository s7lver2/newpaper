pub mod ai;
pub mod commands;
pub mod config;
pub mod error;
pub mod features;
#[cfg(desktop)]
pub mod npimg;
pub mod privacy;
#[cfg(desktop)]
pub mod resources;
pub mod sources;
mod setup;
pub mod sync;
pub mod system;
/// Puente móvil (subproyecto 8): intent de compartir, almacén seguro, webview original.
#[cfg(mobile)]
pub mod mobile;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();
    let builder = tauri::Builder::default();
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| crate::system::on_second_instance(app, argv)))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .register_asynchronous_uri_scheme_protocol("npimg", npimg::handle)
        .register_asynchronous_uri_scheme_protocol("npoffline", sources::offline_cmds::protocol);
    #[cfg(mobile)]
    let builder = builder.plugin(tauri_plugin_barcode_scanner::init()).plugin(tauri_plugin_np_mobile::init());
    let builder = builder.plugin(tauri_plugin_process::init()).plugin(tauri_plugin_dialog::init()).setup(setup::setup);
    #[cfg(desktop)]
    let builder = builder.invoke_handler(tauri::generate_handler![
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
        sources::offline_cmds::saved_add,
        sources::offline_cmds::saved_remove,
        sources::offline_cmds::saved_list,
        sources::offline_cmds::saved_get,
        sources::offline_cmds::offline_begin,
        sources::offline_cmds::offline_fetch_html,
        sources::offline_cmds::offline_save_image,
        sources::offline_cmds::offline_add_article,
        sources::offline_cmds::offline_finish,
        sources::offline_cmds::offline_editions,
        sources::offline_cmds::offline_edition,
        sources::offline_cmds::offline_search,
        ai::commands::ai_fetch,
        ai::commands::ai_cancel,
        ai::commands::ai_set_endpoints,
        ai::commands::ai_login,
        ai::commands::ai_login_cancel,
        ai::commands::source_fetch,
        ai::commands::analysis_cache_get,
        ai::commands::analysis_cache_put,
        ai::commands::usage_record,
        ai::commands::usage_month,
        ai::commands::ai_local_probe,
        sources::offline_cmds::offline_cleanup,
        system::commands::app_ready,
        system::commands::system_info,
        system::commands::crash_report_save,
        system::updater::update_status,
        system::updater::update_check,
        system::updater::update_install_now,
        system::updater::update_set_channel,
        system::updater::update_ack_notes,
        system::content::content_status,
        system::content::content_check_now,
        system::content::content_revert,
        system::firstrun::first_run_status,
        system::firstrun::first_run_apply,
        system::firstrun::bookmarks_scan,
        system::firstrun::ollama_pull,
        system::firstrun::open_default_apps,
        sync::commands::sync_status,
        sync::commands::sync_set_enabled,
        sync::commands::sync_set_name,
        sync::commands::sync_pair_start,
        sync::commands::sync_pair_cancel,
        sync::commands::sync_pair_with,
        sync::commands::sync_peers,
        sync::commands::sync_peer_update,
        sync::commands::sync_revoke,
        sync::commands::sync_now,
        sync::commands::sync_export,
        sync::commands::sync_import,
    ]);
    #[cfg(mobile)]
    let builder = builder.invoke_handler(tauri::generate_handler![
        commands::settings::settings_get,
        commands::settings::settings_set,
        commands::settings::settings_list,
        commands::history::history_mark_analyzed,
        commands::history::history_search,
        commands::history::history_delete,
        commands::history::history_record_visit,
        commands::secrets::secret_set,
        commands::secrets::secret_has,
        commands::secrets::secret_delete,
        commands::config::config_read,
        privacy::commands::privacy_status,
        privacy::commands::net_set_mode,
        privacy::commands::adblock_status,
        privacy::commands::adblock_set_enabled,
        privacy::commands::adblock_set_list,
        privacy::commands::adblock_refresh,
        sources::commands::feeds_refresh_now,
        sources::commands::coverage_for,
        sources::commands::events_briefing,
        sources::commands::events_search,
        sources::commands::event_detail,
        sources::commands::outlets_list,
        sources::commands::custom_outlets_list,
        sources::commands::custom_outlet_add,
        sources::commands::custom_outlet_remove,
        sources::commands::topics_list,
        sources::commands::topic_set_following,
        sources::commands::watch_add,
        sources::commands::watches_list,
        sources::commands::lexicon_score,
        sources::offline_cmds::saved_add,
        sources::offline_cmds::saved_remove,
        sources::offline_cmds::saved_list,
        sources::offline_cmds::saved_get,
        ai::commands::ai_fetch,
        ai::commands::ai_cancel,
        ai::commands::ai_set_endpoints,
        ai::commands::source_fetch,
        ai::commands::analysis_cache_get,
        ai::commands::analysis_cache_put,
        ai::commands::usage_record,
        ai::commands::usage_month,
        system::content::content_status,
        system::content::content_check_now,
        system::content::content_revert,
        sync::commands::sync_status,
        sync::commands::sync_set_enabled,
        sync::commands::sync_set_name,
        sync::commands::sync_pair_start,
        sync::commands::sync_pair_cancel,
        sync::commands::sync_pair_with,
        sync::commands::sync_peers,
        sync::commands::sync_peer_update,
        sync::commands::sync_revoke,
        sync::commands::sync_now,
        sync::commands::sync_export,
        sync::commands::sync_import,
        mobile::commands::mobile_fetch_page,
        mobile::commands::mobile_pending_share,
        mobile::commands::mobile_original_open,
        mobile::commands::mobile_original_close,
        mobile::commands::mobile_ollama_probe,
        mobile::commands::mobile_use_pc_ollama,
    ]);
    builder
        .build(tauri::generate_context!())
        .expect("error while building newpaper")
        .run(|app, event| {
            #[cfg(desktop)]
            if let tauri::RunEvent::ExitRequested { .. } = event {
                crate::system::updater::on_exit(app);
            }
            // Móvil: Tor no corre en segundo plano (batería); al volver a primer plano arranca si el modo lo pide.
            #[cfg(mobile)]
            match event {
                tauri::RunEvent::WindowEvent { event: tauri::WindowEvent::Suspended, .. } => mobile::lifecycle(app, true),
                tauri::RunEvent::Resumed => mobile::lifecycle(app, false),
                _ => {}
            }
        });
}
