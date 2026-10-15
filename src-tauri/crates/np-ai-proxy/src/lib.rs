//! np-ai-proxy: fetch de LLM con inyección de claves desde el llavero, caché de análisis y consumo.
//! Las claves nunca llegan a la webview: JS manda la petición sin credenciales; Rust valida la URL
//! contra el proveedor, añade la cabecera y devuelve la respuesta en streaming.
pub mod cache;
pub mod error;
pub mod guard;
pub mod headers;
pub mod login;
pub mod proxy;
pub mod sources;
pub mod table;
pub mod usage;

pub use error::ProxyError;
pub use table::{AuthScheme, CustomEndpoint, LoginFlow, LoginSpec, LoginStatus, ProviderSpec, ProviderTable};
