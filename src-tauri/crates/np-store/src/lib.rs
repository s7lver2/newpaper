//! Almacenamiento local de newpaper: SQLite (rusqlite), migraciones, HLC, ajustes, historial y llavero.
pub mod error;
pub mod migrations;
pub mod store;

pub use error::StoreError;
pub use store::Store;
