//! Secretos (claves de API) en el llavero del sistema. Nunca se guardan en SQLite ni llegan a la UI.
use std::{collections::HashMap, sync::Mutex};

use crate::StoreError;

pub trait SecretStore: Send + Sync {
    fn get(&self, key: &str) -> Result<Option<String>, StoreError>;
    fn set(&self, key: &str, value: &str) -> Result<(), StoreError>;
    fn delete(&self, key: &str) -> Result<(), StoreError>;
    fn has(&self, key: &str) -> Result<bool, StoreError> {
        Ok(self.get(key)?.is_some())
    }
}

pub fn validate_secret_key(key: &str) -> Result<(), StoreError> {
    let ok = (1..=64).contains(&key.len())
        && key.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || matches!(b, b'.' | b'_' | b'-'));
    if ok { Ok(()) } else { Err(StoreError::Secret(format!("invalid secret key: {key:?}"))) }
}

#[derive(Default)]
pub struct MemorySecrets(Mutex<HashMap<String, String>>);

impl SecretStore for MemorySecrets {
    fn get(&self, key: &str) -> Result<Option<String>, StoreError> {
        validate_secret_key(key)?;
        Ok(self.0.lock().map_err(|_| StoreError::Poisoned)?.get(key).cloned())
    }
    fn set(&self, key: &str, value: &str) -> Result<(), StoreError> {
        validate_secret_key(key)?;
        self.0.lock().map_err(|_| StoreError::Poisoned)?.insert(key.to_string(), value.to_string());
        Ok(())
    }
    fn delete(&self, key: &str) -> Result<(), StoreError> {
        validate_secret_key(key)?;
        self.0.lock().map_err(|_| StoreError::Poisoned)?.remove(key);
        Ok(())
    }
}

#[cfg(any(windows, target_os = "linux"))]
pub struct KeyringSecrets {
    service: String,
}

#[cfg(any(windows, target_os = "linux"))]
impl KeyringSecrets {
    pub fn new(service: &str) -> Self {
        Self { service: service.to_string() }
    }
    fn entry(&self, key: &str) -> Result<keyring::Entry, StoreError> {
        validate_secret_key(key)?;
        keyring::Entry::new(&self.service, key).map_err(|e| StoreError::Secret(e.to_string()))
    }
}

#[cfg(any(windows, target_os = "linux"))]
impl SecretStore for KeyringSecrets {
    fn get(&self, key: &str) -> Result<Option<String>, StoreError> {
        match self.entry(key)?.get_password() {
            Ok(v) => Ok(Some(v)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(StoreError::Secret(e.to_string())),
        }
    }
    fn set(&self, key: &str, value: &str) -> Result<(), StoreError> {
        self.entry(key)?.set_password(value).map_err(|e| StoreError::Secret(e.to_string()))
    }
    fn delete(&self, key: &str) -> Result<(), StoreError> {
        match self.entry(key)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(StoreError::Secret(e.to_string())),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn exercise(s: &dyn SecretStore) {
        assert_eq!(s.get("ai.test").unwrap(), None);
        assert!(!s.has("ai.test").unwrap());
        s.set("ai.test", "sk-123").unwrap();
        assert_eq!(s.get("ai.test").unwrap().as_deref(), Some("sk-123"));
        assert!(s.has("ai.test").unwrap());
        s.delete("ai.test").unwrap();
        s.delete("ai.test").unwrap(); // borrar dos veces no falla
        assert_eq!(s.get("ai.test").unwrap(), None);
    }

    #[test]
    fn memory_store_behaves_like_a_keyring() {
        exercise(&MemorySecrets::default());
    }

    #[test]
    fn rejects_bad_keys() {
        let s = MemorySecrets::default();
        assert!(s.set("Has Space", "x").is_err());
        assert!(s.set("", "x").is_err());
        assert!(s.set(&"a".repeat(65), "x").is_err());
    }

    #[cfg(any(windows, target_os = "linux"))]
    #[test]
    #[ignore = "toca el llavero real (Credential Manager o Secret Service); ejecutar con --ignored"]
    fn keyring_store_round_trip() {
        exercise(&KeyringSecrets::new("newpaper-test"));
    }
}
