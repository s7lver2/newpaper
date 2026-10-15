//! Puente nativo de newpaper en móvil. Solo lo llama Rust.
//! Android: Kotlin en `android/` (intent de compartir, almacén seguro, webview original, multicast).
//! iOS: fuera de esta versión (necesita macOS); el código de enlace queda preparado con `cfg`.
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use tauri::{
    plugin::{Builder, PluginHandle, TauriPlugin},
    Manager, Runtime,
};

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_np_mobile);

pub struct NpMobile<R: Runtime>(PluginHandle<R>);

#[derive(Debug, thiserror::Error)]
#[error("{0}")]
pub struct MobileError(pub String);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OriginalLabels {
    pub close: String,
    pub analyze: String,
}

/// Proxy de la webview original. Lo decide Rust (`np_mobile_core::proxy::decide`).
#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ProxyArg {
    Direct,
    Socks { port: u16 },
    Block,
}

#[derive(Deserialize)]
struct Opt {
    value: Option<String>,
}

impl<R: Runtime> NpMobile<R> {
    fn call<T: DeserializeOwned>(&self, method: &str, args: impl Serialize) -> Result<T, MobileError> {
        self.0.run_mobile_plugin(method, args).map_err(|e| MobileError(e.to_string()))
    }
    pub fn pending_share(&self) -> Result<Option<String>, MobileError> {
        Ok(self.call::<Opt>("pendingShare", ())?.value)
    }
    pub fn secure_get(&self, key: &str) -> Result<Option<String>, MobileError> {
        Ok(self.call::<Opt>("secureGet", serde_json::json!({ "key": key }))?.value)
    }
    pub fn secure_set(&self, key: &str, value: &str) -> Result<(), MobileError> {
        self.call::<serde_json::Value>("secureSet", serde_json::json!({ "key": key, "value": value })).map(|_| ())
    }
    pub fn secure_delete(&self, key: &str) -> Result<(), MobileError> {
        self.call::<serde_json::Value>("secureDelete", serde_json::json!({ "key": key })).map(|_| ())
    }
    pub fn original_open(&self, url: &str, labels: OriginalLabels) -> Result<(), MobileError> {
        self.call::<serde_json::Value>("originalOpen", serde_json::json!({ "url": url, "labels": labels })).map(|_| ())
    }
    pub fn original_close(&self) -> Result<(), MobileError> {
        self.call::<serde_json::Value>("originalClose", ()).map(|_| ())
    }
    pub fn set_proxy(&self, p: ProxyArg) -> Result<(), MobileError> {
        self.call::<serde_json::Value>("setProxy", p).map(|_| ())
    }
    /// Iconos de las barras del sistema: claros sobre fondo oscuro (tinta) u oscuros sobre papel.
    pub fn system_bars(&self, dark_background: bool) -> Result<(), MobileError> {
        self.call::<serde_json::Value>("systemBars", serde_json::json!({ "dark": dark_background })).map(|_| ())
    }
    pub fn multicast(&self, on: bool) -> Result<(), MobileError> {
        self.call::<serde_json::Value>("multicast", serde_json::json!({ "on": on })).map(|_| ())
    }
}

pub trait NpMobileExt<R: Runtime> {
    fn np_mobile(&self) -> &NpMobile<R>;
}

impl<R: Runtime, T: Manager<R>> NpMobileExt<R> for T {
    fn np_mobile(&self) -> &NpMobile<R> {
        self.state::<NpMobile<R>>().inner()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("np-mobile")
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            let handle = api.register_android_plugin("app.newpaper.mobile", "NpMobilePlugin")?;
            #[cfg(target_os = "ios")]
            let handle = api.register_ios_plugin(init_plugin_np_mobile)?;
            app.manage(NpMobile(handle));
            Ok(())
        })
        .build()
}
