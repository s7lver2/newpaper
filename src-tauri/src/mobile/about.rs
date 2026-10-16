//! Datos de compilación y del dispositivo para la pantalla «Acerca de». Sin secretos, sin IP, sin identificadores.
use std::{fs, path::Path};

use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildInfo {
    pub version: &'static str,
    /// `debug` o `release`.
    pub profile: &'static str,
    /// Segundos Unix de la compilación.
    pub built_at: i64,
    pub git: &'static str,
    pub git_dirty: bool,
    pub deps: Vec<(String, String)>,
}

pub fn build_info() -> BuildInfo {
    BuildInfo {
        version: env!("CARGO_PKG_VERSION"),
        profile: env!("NP_BUILD_PROFILE"),
        built_at: env!("NP_BUILD_EPOCH").parse().unwrap_or(0),
        git: env!("NP_GIT_HASH"),
        git_dirty: env!("NP_GIT_DIRTY") == "true",
        deps: parse_deps(env!("NP_DEPS")),
    }
}

/// `nombre=versión,nombre=versión` → pares (se ignoran las entradas mal formadas).
pub fn parse_deps(raw: &str) -> Vec<(String, String)> {
    raw.split(',')
        .filter_map(|p| p.split_once('='))
        .filter(|(n, v)| !n.is_empty() && !v.is_empty())
        .map(|(n, v)| (n.to_owned(), v.to_owned()))
        .collect()
}

/// Tamaño en bytes de un directorio (suma de ficheros; no sigue enlaces simbólicos; tope de entradas por si algo va mal).
pub fn dir_size(root: &Path) -> u64 {
    let mut total = 0u64;
    let mut stack = vec![root.to_path_buf()];
    let mut seen = 0usize;
    while let Some(dir) = stack.pop() {
        let Ok(rd) = fs::read_dir(&dir) else { continue };
        for entry in rd.flatten() {
            seen += 1;
            if seen > 200_000 {
                return total;
            }
            let Ok(ft) = entry.file_type() else { continue };
            if ft.is_symlink() {
                continue;
            }
            if ft.is_dir() {
                stack.push(entry.path());
            } else if let Ok(m) = entry.metadata() {
                total += m.len();
            }
        }
    }
    total
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_dependency_list() {
        assert_eq!(parse_deps("tauri=2.12.1,adblock=0.13.3"), vec![("tauri".into(), "2.12.1".into()), ("adblock".into(), "0.13.3".into())]);
        assert!(parse_deps("").is_empty());
        assert!(parse_deps("sinversion=,=x,basura").is_empty());
    }

    #[test]
    fn dir_size_sums_nested_files() {
        let d = tempfile::tempdir().unwrap();
        fs::write(d.path().join("a"), [0u8; 10]).unwrap();
        fs::create_dir(d.path().join("s")).unwrap();
        fs::write(d.path().join("s").join("b"), [0u8; 5]).unwrap();
        assert_eq!(dir_size(d.path()), 15);
        assert_eq!(dir_size(&d.path().join("nope")), 0);
    }
}
