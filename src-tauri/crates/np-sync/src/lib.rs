//! np-sync: sincronización sin cuenta entre dispositivos (§15).
pub mod crypto;
pub mod discovery;
pub mod error;
pub mod identity;
pub mod npsync;
pub mod pairing;
pub mod peers;
pub mod rows;
pub mod session;
pub mod wire;

pub use error::{Result, SyncError};
pub use zeroize;
