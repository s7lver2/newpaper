use thiserror::Error;

#[derive(Debug, Error)]
pub enum UpdateError {
    #[error("invalid signature: {0}")]
    Signature(String),
    #[error("invalid encoding: {0}")]
    Encoding(String),
    #[error("hash mismatch for {name}")]
    Hash { name: String },
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
    #[error("manifest: {0}")]
    Manifest(String),
    #[error("sql: {0}")]
    Sql(#[from] rusqlite::Error),
}

pub type Result<T> = std::result::Result<T, UpdateError>;
