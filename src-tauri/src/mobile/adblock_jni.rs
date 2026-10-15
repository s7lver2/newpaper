//! `NpNative.shouldBlock` para `shouldInterceptRequest` (se llama desde varios hilos de la webview).
#![cfg(target_os = "android")]
use std::sync::{Arc, OnceLock};

use jni::{
    objects::{JClass, JString},
    sys::{jboolean, JNI_FALSE, JNI_TRUE},
    JNIEnv,
};
use np_adblock::{blocker::ResourceType, service::AdblockService};

pub static ADBLOCK: OnceLock<Arc<AdblockService>> = OnceLock::new();

fn kind_of(s: &str) -> ResourceType {
    if s == "document" {
        ResourceType::Document
    } else {
        ResourceType::Other
    }
}

#[no_mangle]
pub extern "system" fn Java_app_newpaper_mobile_NpNative_shouldBlock(
    mut env: JNIEnv,
    _class: JClass,
    url: JString,
    source: JString,
    kind: JString,
) -> jboolean {
    let get = |env: &mut JNIEnv, s: &JString| env.get_string(s).map(String::from).unwrap_or_default();
    let (url, source, kind) = (get(&mut env, &url), get(&mut env, &source), get(&mut env, &kind));
    match ADBLOCK.get() {
        // Pestaña 0: la webview original no tiene pestañas; las estadísticas quedan agregadas.
        Some(a) if a.check(0, &url, &source, kind_of(&kind), "GET") => JNI_TRUE,
        _ => JNI_FALSE,
    }
}
