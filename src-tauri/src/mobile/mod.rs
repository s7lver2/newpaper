//! Subproyecto 8: integración móvil (Android primero; iOS queda con su `cfg` preparado).
#[cfg(target_os = "android")]
pub mod adblock_jni;
pub mod about;
pub mod commands;
#[cfg(target_os = "android")]
pub mod net_jni;
pub mod proxy;
pub mod secrets;

use std::sync::{Arc, OnceLock};

use np_net::NetController;
use tauri::{AppHandle, App, Manager, Wry};

/// Contadores de anuncios y rastreadores bloqueados (los incrementa el puente JNI y los vuelca `privacy::spawn_stats_flush`).
pub static KINDS: OnceLock<Arc<np_adblock::kind_stats::KindCounter>> = OnceLock::new();

/// Red compartida con el puente JNI (cambios de red desde el plugin Kotlin).
pub static NET: OnceLock<Arc<NetController>> = OnceLock::new();

/// Suspender / reanudar la app. Arti necesita runtime de Tauri, por eso el trabajo va en `async_runtime`.
pub fn lifecycle(app: &AppHandle<Wry>, suspended: bool) {
    tracing::info!(suspended, "app lifecycle");
    let net = app.state::<Arc<NetController>>().inner().clone();
    tauri::async_runtime::spawn(async move {
        if suspended {
            net.pause_tor();
        } else {
            net.resume_tor();
        }
    });
}

pub fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let net = app.state::<Arc<np_net::NetController>>().inner().clone();
    let _ = NET.set(net.clone());
    let _ = KINDS.set(Arc::new(np_adblock::kind_stats::KindCounter::new()));
    proxy::follow(app.handle().clone(), net);
    #[cfg(target_os = "android")]
    {
        let ad = app.state::<Arc<np_adblock::service::AdblockService>>().inner().clone();
        let _ = adblock_jni::ADBLOCK.set(ad);
    }
    Ok(())
}
