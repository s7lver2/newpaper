//! Bloqueo de anuncios, rastreadores y molestias para las webviews de contenido.
pub mod blocker;
pub mod cosmetic;
pub mod kind_stats;
pub mod lists;
pub mod updater;
pub mod stats;
pub mod service;
#[cfg(windows)]
pub mod webview2;
pub mod cosmetic_msg;
/// Traducción de las listas al bloqueo de contenido de WebKit (WebKitGTK, Linux); sin gancho por petición.
#[cfg(feature = "content-blocking")]
pub mod content_filter;
