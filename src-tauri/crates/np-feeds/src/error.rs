use thiserror::Error;

#[derive(Debug, Error)]
pub enum FeedsError {
    #[error("invalid config: {0}")]
    Config(String),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("sqlite: {0}")]
    Sql(#[from] rusqlite::Error),
    #[error("store: {0}")]
    Store(#[from] np_store::StoreError),
    #[error("http: {0}")]
    Http(#[from] reqwest::Error),
    #[error("http status {0}")]
    Status(u16),
    #[error("invalid feed: {0}")]
    Parse(String),
    #[error("response too large ({0} bytes)")]
    TooLarge(usize),
    #[error("not found: {0}")]
    NotFound(String),
}

pub type Result<T> = std::result::Result<T, FeedsError>;
