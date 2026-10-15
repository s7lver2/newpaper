//! Red de newpaper: proxy SOCKS5 local servido por Arti (Tor) con kill switch y rutas de tráfico.
pub mod error;
pub mod mode;

pub use error::NetError;
pub use mode::{compose_status, normalize_country, route, NetMode, NetSettings, NetStatus, Route, TorState, Traffic};
pub mod socks;
pub use socks::TargetAddr;
pub mod fake;
pub mod server;
pub use server::{BoxStream, ConnectError, Connector, SocksServer, TorBackend};
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub mod tor;
pub mod controller;
pub use controller::NetController;

/// Raíces de confianza de los clientes HTTP. En Android el verificador de plataforma de rustls no está
/// inicializado (panic en la primera conexión TLS), así que se usan las raíces Mozilla embebidas.
pub fn with_roots(b: reqwest::ClientBuilder) -> reqwest::ClientBuilder {
    #[cfg(target_os = "android")]
    {
        let certs = webpki_root_certs::TLS_SERVER_ROOT_CERTS.iter().filter_map(|c| reqwest::Certificate::from_der(c.as_ref()).ok());
        return b.tls_certs_only(certs);
    }
    #[cfg(not(target_os = "android"))]
    b
}
