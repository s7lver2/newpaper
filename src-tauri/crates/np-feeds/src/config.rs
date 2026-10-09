//! Esquema de `config/sources-<locale>.json`.
use std::collections::HashSet;

use serde::{Deserialize, Serialize};

use crate::{FeedsError, Result};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Sources {
    pub version: u32,
    #[serde(rename = "medios")]
    pub outlets: Vec<Outlet>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum OutletKind {
    Medio,
    Agencia,
    Verificador,
}

impl OutletKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            OutletKind::Medio => "medio",
            OutletKind::Agencia => "agencia",
            OutletKind::Verificador => "verificador",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Outlet {
    pub id: String,
    #[serde(rename = "nombre")]
    pub name: String,
    #[serde(rename = "dominio")]
    pub domain: String,
    pub feeds: Vec<String>,
    #[serde(rename = "pais")]
    pub country: String,
    #[serde(rename = "idioma")]
    pub language: String,
    #[serde(rename = "tipo")]
    pub kind: OutletKind,
}

/// Host en minúsculas sin `www.`.
pub fn host_of(url: &str) -> Option<String> {
    let u = url::Url::parse(url).ok()?;
    let h = u.host_str()?.to_ascii_lowercase();
    Some(h.strip_prefix("www.").map(str::to_string).unwrap_or(h))
}

impl Sources {
    pub fn from_json(json: &str) -> Result<Self> {
        let s: Sources = serde_json::from_str(json)?;
        s.validate()?;
        Ok(s)
    }

    pub fn validate(&self) -> Result<()> {
        if self.version != 1 {
            return Err(FeedsError::Config(format!("unsupported sources version {}", self.version)));
        }
        let mut ids = HashSet::new();
        let mut domains = HashSet::new();
        for o in &self.outlets {
            if o.id.is_empty() || !o.id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') {
                return Err(FeedsError::Config(format!("invalid id: {:?}", o.id)));
            }
            if !ids.insert(o.id.clone()) {
                return Err(FeedsError::Config(format!("duplicate id: {}", o.id)));
            }
            if o.domain.contains("://") || o.domain.starts_with("www.") || o.domain.contains('/') {
                return Err(FeedsError::Config(format!("domain must be a bare host: {}", o.domain)));
            }
            if !domains.insert(o.domain.clone()) {
                return Err(FeedsError::Config(format!("duplicate domain: {}", o.domain)));
            }
            if o.country.len() != 2 || o.language.len() != 2 {
                return Err(FeedsError::Config(format!("country/language must be 2-letter codes: {}", o.id)));
            }
            for f in &o.feeds {
                let u = url::Url::parse(f).map_err(|e| FeedsError::Config(format!("feed {f}: {e}")))?;
                if !matches!(u.scheme(), "http" | "https") {
                    return Err(FeedsError::Config(format!("feed is not http(s): {f}")));
                }
            }
        }
        Ok(())
    }

    pub fn domains(&self) -> Vec<String> {
        self.outlets.iter().map(|o| o.domain.clone()).collect()
    }

    pub fn outlet_for_url(&self, url: &str) -> Option<&Outlet> {
        let host = host_of(url)?;
        self.outlets
            .iter()
            .filter(|o| host == o.domain || host.ends_with(&format!(".{}", o.domain)))
            .max_by_key(|o| o.domain.len())
    }

    /// Une varios ficheros (idiomas); si un id o dominio se repite, gana el primero.
    pub fn merge(all: &[Sources]) -> Sources {
        let mut out = Sources { version: 1, outlets: Vec::new() };
        for s in all {
            for o in &s.outlets {
                if !out.outlets.iter().any(|x| x.id == o.id || x.domain == o.domain) {
                    out.outlets.push(o.clone());
                }
            }
        }
        out
    }
}
