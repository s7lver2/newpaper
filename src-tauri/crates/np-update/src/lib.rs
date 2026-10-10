//! np-update: firmas minisign, guardia de arranque y manifiesto de contenido (§17).
pub mod boot;
pub mod channels;
pub mod content;
pub mod error;
pub mod repo;
pub mod sig;

pub use error::{Result, UpdateError};
