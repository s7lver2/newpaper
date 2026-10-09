//! Hemeroteca (§5.3): capturas del Internet Archive, diff por palabras y ediciones.
pub mod cdx;
pub mod repo;

#[derive(Debug, thiserror::Error)]
pub enum WaybackError {
    #[error("http: {0}")]
    Http(#[from] reqwest::Error),
    #[error("http status {0}")]
    Status(u16),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
    #[error("sqlite: {0}")]
    Sql(#[from] rusqlite::Error),
    #[error("store: {0}")]
    Store(#[from] np_store::StoreError),
    #[error("capture too large")]
    TooLarge,
}

pub type Result<T> = std::result::Result<T, WaybackError>;
