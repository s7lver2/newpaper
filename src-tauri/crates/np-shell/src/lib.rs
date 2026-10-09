//! Navegador de newpaper: pestañas, entrada de la barra, mensajes de contenido y anfitrión WebView2.
pub mod input;
pub mod model;

pub type TabId = u64;
pub const NEW_TAB_URL: &str = "newpaper://inicio";
pub mod message;
pub mod resources;
#[cfg(windows)]
pub mod sysmem;
pub mod transition;
pub mod news;
pub mod extensions;
pub mod host;
pub use host::{Rect, ShellError, TabManager};
