//! np-feeds: índice RSS, hechos, coberturas equilibradas, búsqueda de respaldo, línea editorial,
//! temas, vigilancias, artículos guardados y ediciones sin conexión.
pub mod cluster;
pub mod config;
pub mod briefing;
pub mod coverage;
pub mod error;
pub mod settings;
pub mod text;
pub mod tfidf;
pub mod topics;
pub mod watches;
pub mod fetch;
pub mod ingest;
pub mod events;
pub mod lean;
pub mod parse;
pub mod priors;
pub mod stats;
pub mod repo;
pub mod search;

pub use error::{FeedsError, Result};
