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
pub mod tor;
pub mod controller;
pub use controller::NetController;
