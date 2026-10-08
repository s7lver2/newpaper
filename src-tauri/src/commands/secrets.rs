//! Comandos del llavero. La UI puede guardar, comprobar y borrar claves, nunca leerlas.
use std::sync::Arc;

use np_store::secrets::SecretStore;
use tauri::State;

use crate::error::{CmdError, CmdResult};

pub fn validate_secret_value(value: &str) -> CmdResult<()> {
    if value.is_empty() || value.len() > 4096 || value.contains(['\n', '\r']) {
        return Err(CmdError::new("secret_value", "invalid secret value"));
    }
    Ok(())
}

#[tauri::command]
pub async fn secret_set(secrets: State<'_, Arc<dyn SecretStore>>, key: String, value: String) -> CmdResult<()> {
    validate_secret_value(value.trim())?;
    Ok(secrets.set(&key, value.trim())?)
}

#[tauri::command]
pub async fn secret_has(secrets: State<'_, Arc<dyn SecretStore>>, key: String) -> CmdResult<bool> {
    Ok(secrets.has(&key)?)
}

#[tauri::command]
pub async fn secret_delete(secrets: State<'_, Arc<dyn SecretStore>>, key: String) -> CmdResult<()> {
    Ok(secrets.delete(&key)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn secret_values_are_bounded_single_lines() {
        assert!(validate_secret_value("sk-ant-123").is_ok());
        assert!(validate_secret_value("").is_err());
        assert!(validate_secret_value("a\nb").is_err());
        assert!(validate_secret_value(&"x".repeat(4097)).is_err());
    }
}
