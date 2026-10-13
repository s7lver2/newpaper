//! Errores de la sincronización. Nunca contienen claves ni datos de las filas.
use thiserror::Error;

#[derive(Debug, Error)]
pub enum SyncError {
    #[error("crypto failure")]
    Crypto,
    #[error("protocol: {0}")]
    Protocol(String),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
    #[error("store: {0}")]
    Store(String),
    #[error("sql: {0}")]
    Sql(#[from] rusqlite::Error),
    #[error("unknown or revoked device")]
    Unauthorized,
    #[error("pairing offer expired")]
    Expired,
}

impl From<np_store::StoreError> for SyncError {
    fn from(e: np_store::StoreError) -> Self {
        SyncError::Store(e.to_string())
    }
}

pub type Result<T> = std::result::Result<T, SyncError>;
