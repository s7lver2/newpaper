use np_store::{secrets::SecretStore, StoreError};
use tauri::{AppHandle, Wry};
use tauri_plugin_np_mobile::NpMobileExt;

/// Claves en Android Keystore / iOS Keychain a través del plugin. Nunca en SQLite ni en la webview.
pub struct MobileSecrets(pub AppHandle<Wry>);

fn err(e: impl ToString) -> StoreError {
    StoreError::Secret(e.to_string())
}

impl SecretStore for MobileSecrets {
    fn get(&self, key: &str) -> Result<Option<String>, StoreError> {
        np_store::secrets::validate_secret_key(key)?;
        self.0.np_mobile().secure_get(key).map_err(err)
    }
    fn set(&self, key: &str, value: &str) -> Result<(), StoreError> {
        np_store::secrets::validate_secret_key(key)?;
        self.0.np_mobile().secure_set(key, value).map_err(err)
    }
    fn delete(&self, key: &str) -> Result<(), StoreError> {
        np_store::secrets::validate_secret_key(key)?;
        self.0.np_mobile().secure_delete(key).map_err(err)
    }
}
