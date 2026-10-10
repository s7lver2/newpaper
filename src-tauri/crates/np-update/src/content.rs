//! Contenido actualizable sin reinstalar: manifiesto firmado, versión por recurso, aplicación atómica y reversible (§17).

use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::{sig, Result, UpdateError};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Resource {
    pub name: String,
    pub version: u32,
    pub sha256: String,
    pub url: String,
    pub bytes: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Manifest {
    pub version: u32,
    pub issued: String,
    pub resources: Vec<Resource>,
}

/// Prefijos de los ficheros de `config/` que el manifiesto puede sustituir (decisión 10).
pub const ALLOWED: &[&str] = &[
    "sources-", "topics-", "outlet-priors", "parties-", "lexicon-", "providers", "prices", "primary-sources", "framing-weights", "mirror-swaps-",
];

fn allowed(name: &str) -> bool {
    name.ends_with(".json")
        && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.' || c == '_')
        && !name.contains("..")
        && ALLOWED.iter().any(|p| name.starts_with(p))
}

pub fn parse_verified(pubkey: &str, manifest: &[u8], signature: &str) -> Result<Manifest> {
    sig::verify(pubkey, manifest, signature)?;
    let m: Manifest = serde_json::from_slice(manifest)?;
    let mut seen = HashSet::new();
    for r in &m.resources {
        if !allowed(&r.name) {
            return Err(UpdateError::Manifest(format!("resource not allowed: {}", r.name)));
        }
        if !seen.insert(r.name.as_str()) {
            return Err(UpdateError::Manifest(format!("duplicate resource: {}", r.name)));
        }
        if !r.url.starts_with("https://") {
            return Err(UpdateError::Manifest(format!("insecure url: {}", r.url)));
        }
    }
    Ok(m)
}

pub struct ContentDir {
    root: PathBuf,
}

const MANIFEST: &str = "manifest.json";

impl ContentDir {
    pub fn new(root: &Path) -> Self {
        Self { root: root.to_path_buf() }
    }
    fn dir(&self, name: &str) -> PathBuf {
        self.root.join(name)
    }

    pub fn current_manifest(&self) -> Option<Manifest> {
        fs::read(self.dir("current").join(MANIFEST)).ok().and_then(|b| serde_json::from_slice(&b).ok())
    }

    pub fn plan(&self, m: &Manifest) -> Vec<Resource> {
        let cur = self.current_manifest();
        m.resources
            .iter()
            .filter(|r| match cur.as_ref().and_then(|c| c.resources.iter().find(|x| x.name == r.name)) {
                Some(old) => r.version > old.version || r.sha256 != old.sha256,
                None => true,
            })
            .cloned()
            .collect()
    }

    /// Escribe una carpeta `staging-<versión>` completa y verificada. Nada de `current` cambia aquí.
    pub fn stage(&self, m: &Manifest, fetched: &[(String, Vec<u8>)]) -> Result<PathBuf> {
        let staging = self.dir(&format!("staging-{}", m.version));
        if staging.exists() {
            fs::remove_dir_all(&staging)?;
        }
        fs::create_dir_all(&staging)?;
        let result = (|| {
            for r in &m.resources {
                let bytes = match fetched.iter().find(|(n, _)| n == &r.name) {
                    Some((_, b)) => b.clone(),
                    None => fs::read(self.dir("current").join(&r.name)).map_err(|_| UpdateError::Manifest(format!("missing resource: {}", r.name)))?,
                };
                if bytes.len() as u64 != r.bytes || format!("{:x}", Sha256::digest(&bytes)) != r.sha256 {
                    return Err(UpdateError::Hash { name: r.name.clone() });
                }
                fs::write(staging.join(&r.name), &bytes)?;
            }
            fs::write(staging.join(MANIFEST), serde_json::to_vec_pretty(m)?)?;
            Ok(())
        })();
        if result.is_err() {
            let _ = fs::remove_dir_all(&staging);
        }
        result.map(|_| staging)
    }

    /// `current` → `previous` y `staging` → `current` con dos renombrados en el mismo volumen.
    pub fn commit(&self, staging: &Path) -> Result<()> {
        let (cur, prev) = (self.dir("current"), self.dir("previous"));
        if prev.exists() {
            fs::remove_dir_all(&prev)?;
        }
        if cur.exists() {
            fs::rename(&cur, &prev)?;
        }
        if let Err(e) = fs::rename(staging, &cur) {
            if prev.exists() {
                let _ = fs::rename(&prev, &cur);
            }
            return Err(e.into());
        }
        Ok(())
    }

    pub fn revert(&self) -> Result<()> {
        let (cur, prev, tmp) = (self.dir("current"), self.dir("previous"), self.dir("swap"));
        if !prev.exists() {
            return Err(UpdateError::Manifest("nothing to revert".into()));
        }
        if tmp.exists() {
            fs::remove_dir_all(&tmp)?;
        }
        if cur.exists() {
            fs::rename(&cur, &tmp)?;
        }
        fs::rename(&prev, &cur)?;
        if tmp.exists() {
            fs::rename(&tmp, &prev)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::{Digest, Sha256};
    use std::io::Cursor;

    fn keys() -> (String, minisign::SecretKey) {
        let kp = minisign::KeyPair::generate_unencrypted_keypair().unwrap();
        (kp.pk.to_box().unwrap().into_string(), kp.sk)
    }
    fn res(name: &str, version: u32, data: &[u8]) -> Resource {
        Resource { name: name.into(), version, sha256: format!("{:x}", Sha256::digest(data)), url: format!("https://x.test/{name}"), bytes: data.len() as u64 }
    }
    fn signed(sk: &minisign::SecretKey, m: &Manifest) -> (Vec<u8>, String) {
        let bytes = serde_json::to_vec(m).unwrap();
        let sig = minisign::sign(None, sk, Cursor::new(&bytes), None, None).unwrap().into_string();
        (bytes, sig)
    }

    #[test]
    fn rejects_bad_signatures_and_unexpected_names() {
        let (pk, sk) = keys();
        let m = Manifest { version: 1, issued: "2026-10-08".into(), resources: vec![res("sources-es.json", 1, b"{}")] };
        let (bytes, sig) = signed(&sk, &m);
        assert_eq!(parse_verified(&pk, &bytes, &sig).unwrap(), m);
        let mut tampered = bytes.clone();
        tampered[5] ^= 1;
        assert!(parse_verified(&pk, &tampered, &sig).is_err());
        for bad in ["../evil.json", "keys/content.pub", "sources-es.exe", "C:\\x.json"] {
            let m = Manifest { version: 1, issued: "x".into(), resources: vec![res(bad, 1, b"{}")] };
            let (b, s) = signed(&sk, &m);
            assert!(parse_verified(&pk, &b, &s).is_err(), "{bad}");
        }
    }

    #[test]
    fn stages_only_verified_files_commits_atomically_and_reverts() {
        let dir = tempfile::tempdir().unwrap();
        let cd = ContentDir::new(dir.path());
        let m1 = Manifest { version: 1, issued: "a".into(), resources: vec![res("sources-es.json", 1, b"v1"), res("providers.json", 1, b"p1")] };
        let s = cd.stage(&m1, &[("sources-es.json".into(), b"v1".to_vec()), ("providers.json".into(), b"p1".to_vec())]).unwrap();
        cd.commit(&s).unwrap();
        assert_eq!(std::fs::read(dir.path().join("current/sources-es.json")).unwrap(), b"v1");

        let m2 = Manifest { version: 2, issued: "b".into(), resources: vec![res("sources-es.json", 2, b"v2"), res("providers.json", 1, b"p1")] };
        assert_eq!(cd.plan(&m2).iter().map(|r| r.name.as_str()).collect::<Vec<_>>(), vec!["sources-es.json"]);
        // Hash incorrecto: no se toca `current`.
        assert!(matches!(cd.stage(&m2, &[("sources-es.json".into(), b"evil".to_vec())]), Err(UpdateError::Hash { .. })));
        assert_eq!(std::fs::read(dir.path().join("current/sources-es.json")).unwrap(), b"v1");

        let s = cd.stage(&m2, &[("sources-es.json".into(), b"v2".to_vec())]).unwrap();
        cd.commit(&s).unwrap();
        assert_eq!(std::fs::read(dir.path().join("current/sources-es.json")).unwrap(), b"v2");
        assert_eq!(std::fs::read(dir.path().join("current/providers.json")).unwrap(), b"p1");
        assert_eq!(cd.current_manifest().unwrap().version, 2);

        cd.revert().unwrap();
        assert_eq!(std::fs::read(dir.path().join("current/sources-es.json")).unwrap(), b"v1");
        assert_eq!(cd.current_manifest().unwrap().version, 1);
    }
}
