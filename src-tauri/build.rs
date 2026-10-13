/// Comandos de la app que requieren permiso explícito (AppManifest). Cada subproyecto añade los suyos
/// aquí, en `tauri::generate_handler!` (lib.rs) y en `capabilities/ui.json`.
const APP_COMMANDS: &[&str] = &[
    "tab_open", "tab_close", "tab_activate", "tab_pin", "tab_group", "tab_ungroup", "tab_group_update", "tab_close_group", "tab_navigate", "tab_back", "tab_forward", "tab_reload",
    "tab_set_view", "tab_set_bounds", "tabs_snapshot", "chrome_set_theme", "chrome_set_motion", "ctx_close", "resources_status", "resources_snooze", "resources_close_background", "app_exit", "overlay_open", "ctx_edit", "clipboard_text",
    "settings_get", "settings_set", "settings_list",
    "history_record_visit", "history_record_search", "history_mark_analyzed", "history_search",
    "history_delete", "omnibox_suggest",
    "secret_set", "secret_has", "secret_delete",
    "config_read",
    "privacy_status", "net_set_mode", "tor_set_exit_country", "tor_new_circuit", "privacy_set_routing",
    "tab_without_tor", "adblock_status", "adblock_set_enabled", "adblock_set_list", "adblock_refresh",
    "blocked_counts",
    "feeds_refresh_now", "coverage_for", "events_briefing", "events_search", "event_detail", "outlets_list",
    "outlet_override_set", "outlet_stats_recompute", "custom_outlets_list", "custom_outlet_add", "custom_outlet_remove",
    "topics_list", "topic_set_following", "watch_add", "watches_list", "lexicon_score",
    "wayback_captures", "wayback_capture_html", "wayback_analyze", "wayback_diff",
    "saved_add", "saved_remove", "saved_list", "saved_get", "offline_begin", "offline_fetch_html", "offline_save_image",
    "offline_add_article", "offline_finish", "offline_editions", "offline_edition", "offline_search", "offline_cleanup",
    "ai_fetch", "ai_cancel", "ai_set_endpoints", "source_fetch", "analysis_cache_get", "analysis_cache_put", "usage_record", "usage_month", "ai_local_probe",
    "app_ready", "system_info", "crash_report_save",
    "update_status", "update_check", "update_install_now", "update_set_channel", "update_ack_notes",
    "content_status", "content_check_now", "content_revert",
    "first_run_status", "first_run_apply", "bookmarks_scan", "ollama_pull", "open_default_apps",
    "sync_status", "sync_set_enabled", "sync_set_name", "sync_pair_start", "sync_pair_cancel", "sync_pair_with", "sync_peers", "sync_peer_update", "sync_revoke", "sync_now", "sync_export", "sync_import",
];

fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(APP_COMMANDS)),
    )
    .expect("failed to run tauri-build");
}
