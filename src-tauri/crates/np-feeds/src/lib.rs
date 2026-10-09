//! np-feeds: índice RSS, hechos, coberturas equilibradas, búsqueda de respaldo, línea editorial,
//! temas, vigilancias, artículos guardados y ediciones sin conexión.
pub mod cluster;
pub mod config;
pub mod error;
pub mod settings;
pub mod text;
pub mod tfidf;

pub use error::{FeedsError, Result};
