use serde::Serialize;

/// Error serializado hacia la UI: `{ code, message }`. La UI traduce `code` (`errors.<code>`).
#[derive(Debug, Clone, Serialize)]
pub struct CmdError {
    pub code: String,
    pub message: String,
}

impl CmdError {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        Self { code: code.to_string(), message: message.into() }
    }
}

impl From<np_store::StoreError> for CmdError {
    fn from(e: np_store::StoreError) -> Self {
        CmdError::new("store", e.to_string())
    }
}

impl From<np_shell::ShellError> for CmdError {
    fn from(e: np_shell::ShellError) -> Self {
        CmdError::new("shell", e.to_string())
    }
}

pub type CmdResult<T> = Result<T, CmdError>;
