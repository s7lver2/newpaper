//! Bloqueo de anuncios, rastreadores y molestias para las webviews de contenido.
pub mod blocker;
pub mod cosmetic;
pub mod lists;
pub mod updater;
pub mod stats;
pub mod service;
#[cfg(windows)]
pub mod webview2;
pub mod cosmetic_msg;
