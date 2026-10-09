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
];

fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(APP_COMMANDS)),
    )
    .expect("failed to run tauri-build");
}
