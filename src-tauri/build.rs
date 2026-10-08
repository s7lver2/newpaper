/// Comandos de la app que requieren permiso explícito (AppManifest). Cada subproyecto añade los suyos
/// aquí, en `tauri::generate_handler!` (lib.rs) y en `capabilities/ui.json`.
const APP_COMMANDS: &[&str] = &[
    "tab_open", "tab_close", "tab_activate", "tab_navigate", "tab_back", "tab_forward", "tab_reload",
    "tab_set_view", "tab_set_bounds", "tabs_snapshot", "chrome_set_theme",
    "settings_get", "settings_set", "settings_list",
    "history_record_visit", "history_record_search", "history_mark_analyzed", "history_search",
    "history_delete", "omnibox_suggest",
    "secret_set", "secret_has", "secret_delete",
    "config_read",
    "privacy_status", "net_set_mode", "tor_set_exit_country", "tor_new_circuit", "privacy_set_routing",
    "tab_without_tor", "adblock_status", "adblock_set_enabled", "adblock_set_list", "adblock_refresh",
    "blocked_counts",
];

fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(APP_COMMANDS)),
    )
    .expect("failed to run tauri-build");
}
