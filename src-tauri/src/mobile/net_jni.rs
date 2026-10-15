//! `NpNative.networkChanged`: el plugin avisa de un cambio de red y Arti se reconecta (con debounce en `NetController`).
#![cfg(target_os = "android")]
use jni::{objects::JClass, JNIEnv};

#[no_mangle]
pub extern "system" fn Java_app_newpaper_mobile_NpNative_networkChanged(_env: JNIEnv, _class: JClass) {
    tracing::info!("system reported a default-network change");
    if let Some(net) = super::NET.get().cloned() {
        tauri::async_runtime::spawn(async move {
            net.network_changed();
        });
    }
}
