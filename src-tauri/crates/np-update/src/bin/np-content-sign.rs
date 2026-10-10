//! np-content-sign --key <secret.key> --dir config --base-url <url> --version <n> --out <dir>
//! Escribe en <out> los ficheros con sufijo de versión, manifest.json y manifest.json.minisig.
use std::{collections::HashMap, fs, io::Cursor, path::PathBuf};

use np_update::content::{Manifest, Resource, ALLOWED};
use sha2::{Digest, Sha256};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();
    let get = |k: &str| args.iter().position(|a| a == k).and_then(|i| args.get(i + 1)).cloned().ok_or(format!("missing {k}"));
    let boxed = minisign::SecretKeyBox::from_string(&fs::read_to_string(get("--key")?)?)?;
    // Clave con contraseña (lo normal): NP_CONTENT_KEY_PASSWORD. Sin contraseña: clave sin cifrar.
    let key = match std::env::var("NP_CONTENT_KEY_PASSWORD") {
        Ok(p) => boxed.into_secret_key(Some(p))?,
        Err(_) => boxed.into_unencrypted_secret_key()?,
    };
    let dir = PathBuf::from(get("--dir")?);
    let out = PathBuf::from(get("--out")?);
    let base = get("--base-url")?;
    let version: u32 = get("--version")?.parse()?;
    let previous: HashMap<String, Resource> = fs::read(out.join("manifest.json"))
        .ok()
        .and_then(|b| serde_json::from_slice::<Manifest>(&b).ok())
        .map(|m| m.resources.into_iter().map(|r| (r.name.clone(), r)).collect())
        .unwrap_or_default();
    fs::create_dir_all(&out)?;
    let mut resources = Vec::new();
    for entry in fs::read_dir(&dir)? {
        let name = entry?.file_name().to_string_lossy().to_string();
        if !name.ends_with(".json") || !ALLOWED.iter().any(|p| name.starts_with(p)) {
            continue;
        }
        let bytes = fs::read(dir.join(&name))?;
        let sha256 = format!("{:x}", Sha256::digest(&bytes));
        let v = match previous.get(&name) {
            Some(old) if old.sha256 == sha256 => old.version,
            Some(old) => old.version + 1,
            None => 1,
        };
        let file = format!("{}.v{v}.json", name.trim_end_matches(".json"));
        fs::write(out.join(&file), &bytes)?;
        resources.push(Resource { name, version: v, sha256, url: format!("{base}/{file}"), bytes: bytes.len() as u64 });
    }
    resources.sort_by(|a, b| a.name.cmp(&b.name));
    let m = Manifest { version, issued: std::env::var("NP_ISSUED").unwrap_or_else(|_| "unspecified".into()), resources };
    let json = serde_json::to_vec_pretty(&m)?;
    let sig = minisign::sign(None, &key, Cursor::new(&json), Some("newpaper content"), None)?;
    fs::write(out.join("manifest.json"), &json)?;
    fs::write(out.join("manifest.json.minisig"), sig.into_string())?;
    println!("manifest v{version}: {} resources", m.resources.len());
    Ok(())
}
