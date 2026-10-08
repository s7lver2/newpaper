//! Lectura de `config/*.json`: primero la versión actualizada (subproyecto 6), luego la empaquetada.
use std::path::PathBuf;

use serde::Deserialize;
use tauri::{path::BaseDirectory, AppHandle, Manager};

use crate::error::CmdError;

pub const CONTENT_LOCALES: [&str; 3] = ["es", "en", "de"];

pub fn is_config_name(name: &str) -> bool {
    let Some(stem) = name.strip_suffix(".json") else { return false };
    !stem.is_empty()
        && stem.chars().next().is_some_and(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
        && stem.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

pub(crate) fn read_from_dirs(dirs: &[PathBuf], name: &str) -> std::io::Result<String> {
    let mut last = std::io::Error::new(std::io::ErrorKind::NotFound, name.to_string());
    for d in dirs {
        match std::fs::read_to_string(d.join(name)) {
            Ok(s) => return Ok(s),
            Err(e) => last = e,
        }
    }
    Err(last)
}

/// Directorio donde el actualizador de contenido (subproyecto 6) deja la versión vigente.
pub fn content_current_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_local_data_dir().ok().map(|d| d.join("content").join("current"))
}

pub fn read_config_text(app: &AppHandle, name: &str) -> Result<String, CmdError> {
    if !is_config_name(name) {
        return Err(CmdError::new("config_name", name));
    }
    let mut dirs = Vec::new();
    if let Some(d) = content_current_dir(app) {
        dirs.push(d);
    }
    if let Ok(d) = app.path().resolve("config", BaseDirectory::Resource) {
        dirs.push(d);
    }
    read_from_dirs(&dirs, name).map_err(|e| CmdError::new("config_missing", format!("{name}: {e}")))
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct OutletRef {
    pub id: String,
    pub name: String,
    pub domain: String,
}

#[derive(Deserialize)]
struct SourcesFile {
    #[serde(rename = "medios")]
    outlets: Vec<SourceOutlet>,
}

#[derive(Deserialize)]
struct SourceOutlet {
    id: String,
    #[serde(rename = "nombre")]
    name: String,
    #[serde(rename = "dominio")]
    domain: String,
}

#[derive(Debug, Default)]
pub struct OutletIndex {
    pub outlets: Vec<OutletRef>,
}

impl OutletIndex {
    pub fn from_sources_json(files: &[&str]) -> Self {
        let mut outlets: Vec<OutletRef> = Vec::new();
        for raw in files {
            match serde_json::from_str::<SourcesFile>(raw) {
                Ok(f) => {
                    for o in f.outlets {
                        if !outlets.iter().any(|x| x.domain == o.domain) {
                            outlets.push(OutletRef { id: o.id, name: o.name, domain: o.domain.to_ascii_lowercase() });
                        }
                    }
                }
                Err(e) => tracing::warn!(error = %e, "ignoring unreadable sources file"),
            }
        }
        Self { outlets }
    }

    pub fn load(app: &AppHandle) -> Self {
        let texts: Vec<String> = CONTENT_LOCALES
            .iter()
            .filter_map(|l| read_config_text(app, &format!("sources-{l}.json")).ok())
            .collect();
        Self::from_sources_json(&texts.iter().map(String::as_str).collect::<Vec<_>>())
    }

    pub fn domains(&self) -> Vec<String> {
        self.outlets.iter().map(|o| o.domain.clone()).collect()
    }

    pub fn matching(&self, prefix: &str, limit: usize) -> Vec<&OutletRef> {
        let p = prefix.trim().to_lowercase();
        if p.is_empty() {
            return Vec::new();
        }
        self.outlets
            .iter()
            .filter(|o| o.domain.starts_with(&p) || o.name.to_lowercase().starts_with(&p))
            .take(limit)
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ES: &str = r#"{"version":1,"medios":[
      {"id":"elpais","nombre":"El País","dominio":"elpais.com","feeds":[],"pais":"ES","idioma":"es","tipo":"medio"},
      {"id":"efe","nombre":"EFE","dominio":"efe.com","feeds":[],"pais":"ES","idioma":"es","tipo":"agencia"}]}"#;
    const EN: &str = r#"{"version":1,"medios":[
      {"id":"bbc","nombre":"BBC News","dominio":"bbc.co.uk","feeds":[],"pais":"GB","idioma":"en","tipo":"medio"}]}"#;

    #[test]
    fn config_names_are_restricted() {
        assert!(is_config_name("sources-es.json"));
        assert!(is_config_name("providers.json"));
        assert!(!is_config_name("../secrets.json"));
        assert!(!is_config_name("a/b.json"));
        assert!(!is_config_name("x.txt"));
        assert!(!is_config_name(".json"));
    }

    #[test]
    fn outlet_index_merges_locales_and_ignores_broken_files() {
        let idx = OutletIndex::from_sources_json(&[ES, EN, "{broken"]);
        assert_eq!(idx.outlets.len(), 3);
        let mut d = idx.domains();
        d.sort();
        assert_eq!(d, vec!["bbc.co.uk", "efe.com", "elpais.com"]);
    }

    #[test]
    fn outlet_matching_by_name_or_domain_prefix() {
        let idx = OutletIndex::from_sources_json(&[ES, EN]);
        let names: Vec<_> = idx.matching("el", 5).into_iter().map(|o| o.name.clone()).collect();
        assert_eq!(names, vec!["El País".to_string()]);
        assert_eq!(idx.matching("bbc", 5)[0].domain, "bbc.co.uk");
        assert!(idx.matching("", 5).is_empty());
    }

    #[test]
    fn override_file_wins_over_bundled_resource() {
        let dir = tempfile::tempdir().unwrap();
        let bundled = dir.path().join("bundled");
        let current = dir.path().join("current");
        std::fs::create_dir_all(&bundled).unwrap();
        std::fs::create_dir_all(&current).unwrap();
        std::fs::write(bundled.join("prices.json"), "old").unwrap();
        assert_eq!(read_from_dirs(&[current.clone(), bundled.clone()], "prices.json").unwrap(), "old");
        std::fs::write(current.join("prices.json"), "new").unwrap();
        assert_eq!(read_from_dirs(&[current, bundled], "prices.json").unwrap(), "new");
    }
}
