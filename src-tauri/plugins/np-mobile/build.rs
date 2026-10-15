// Solo los permisos de los listeners de eventos; Rust llama al plugin sin pasar por la webview.
const COMMANDS: &[&str] = &["register_listener", "remove_listener"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).android_path("android").build();
}
