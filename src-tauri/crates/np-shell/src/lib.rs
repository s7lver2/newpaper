//! Navegador de newpaper: pestañas, entrada de la barra, mensajes de contenido y anfitrión WebView2.
pub mod input;
pub mod model;

pub type TabId = u64;
pub const NEW_TAB_URL: &str = "newpaper://inicio";
pub mod diagnostics;
pub mod message;
pub mod navigation;
pub mod resources;
#[cfg(windows)]
pub mod sysmem;
pub mod transition;
pub mod news;
pub mod extensions;
/// Pestañas y ventana de escritorio: no existen en Android ni iOS (subproyecto 8).
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub mod host;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub use host::{Rect, ShellError, TabManager};
