#[derive(Debug, thiserror::Error)]
pub enum NetError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("http client: {0}")]
    Http(#[from] reqwest::Error),
    #[error("invalid exit country: {0}")]
    InvalidCountry(String),
    #[error("tor: {0}")]
    Tor(String),
}
