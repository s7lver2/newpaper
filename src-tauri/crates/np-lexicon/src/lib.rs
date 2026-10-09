//! Léxico partidista calibrado con diarios de sesiones (§5.2.1.4): construcción y puntuación.
pub mod congreso;
pub mod ngrams;
pub mod schema;
pub mod score;
pub mod slant;

#[derive(Debug, thiserror::Error)]
pub enum LexError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
    #[error("usage: {0}")]
    Usage(String),
}
