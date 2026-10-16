//! `NpNative.networkChanged`: el plugin avisa de un cambio real de la red por defecto (identificador de red) y
//! `NetController` decide si reinicia Arti (misma red: nada; cambio: reinicio tras calmarse la red).
#![cfg(target_os = "android")]
use jni::{
    objects::{JClass, JString},
    JNIEnv,
};

#[no_mangle]
pub extern "system" fn Java_app_newpaper_mobile_NpNative_networkChanged(mut env: JNIEnv, _class: JClass, id: JString) {
    let id: String = env.get_string(&id).map(|s| s.into()).unwrap_or_else(|_| "unknown".into());
    tracing::info!(network = %id, "system reported a default-network change");
    if let Some(net) = super::NET.get().cloned() {
        tauri::async_runtime::spawn(async move {
            net.network_changed(&id);
        });
    }
}
