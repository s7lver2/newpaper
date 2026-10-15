//! Subproyecto 8: integración móvil (Android primero; iOS queda con su `cfg` preparado).
#[cfg(target_os = "android")]
pub mod adblock_jni;
pub mod commands;
pub mod proxy;
pub mod secrets;

use std::sync::Arc;

use tauri::{App, Manager};

pub fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let net = app.state::<Arc<np_net::NetController>>().inner().clone();
    proxy::follow(app.handle().clone(), net);
    #[cfg(target_os = "android")]
    {
        let ad = app.state::<Arc<np_adblock::service::AdblockService>>().inner().clone();
        let _ = adblock_jni::ADBLOCK.set(ad);
    }
    Ok(())
}
