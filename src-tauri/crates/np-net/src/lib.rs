//! Red de newpaper: proxy SOCKS5 local servido por Arti (Tor) con kill switch y rutas de tráfico.
pub mod error;
pub mod mode;

pub use error::NetError;
pub use mode::{compose_status, normalize_country, route, NetMode, NetSettings, NetStatus, Route, TorState, Traffic};
