#[derive(Debug, thiserror::Error)]
pub enum ProxyError {
    #[error("unknown provider: {0}")]
    UnknownProvider(String),
    #[error("url not allowed for {provider}: {url}")]
    UrlNotAllowed { provider: String, url: String },
    #[error("method not allowed: {0}")]
    MethodNotAllowed(String),
    #[error("request body too large ({0} bytes)")]
    BodyTooLarge(usize),
    #[error("no API key stored for {0}")]
    MissingKey(String),
    #[error("keyring: {0}")]
    Keyring(String),
    #[error("network: {0}")]
    Network(String),
    #[error("duplicate request id: {0}")]
    DuplicateRequest(String),
    #[error("source not allowed: {0}")]
    SourceNotAllowed(String),
    #[error("unsupported content type: {0}")]
    UnsupportedContent(String),
    #[error("cancelled")]
    Cancelled,
    #[error("config: {0}")]
    Config(String),
}

impl ProxyError {
    pub fn code(&self) -> &'static str {
        match self {
            ProxyError::UnknownProvider(_) => "unknown_provider",
            ProxyError::UrlNotAllowed { .. } => "url_not_allowed",
            ProxyError::MethodNotAllowed(_) => "method_not_allowed",
            ProxyError::BodyTooLarge(_) => "body_too_large",
            ProxyError::MissingKey(_) => "missing_key",
            ProxyError::Keyring(_) => "keyring",
            ProxyError::Network(_) => "network",
            ProxyError::DuplicateRequest(_) => "duplicate_request",
            ProxyError::SourceNotAllowed(_) => "source_not_allowed",
            ProxyError::UnsupportedContent(_) => "unsupported_content",
            ProxyError::Cancelled => "cancelled",
            ProxyError::Config(_) => "config",
        }
    }
}
