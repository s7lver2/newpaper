//! Canales de actualización (§17). Cambia `REPO` si el repositorio público es otro.
pub const REPO: &str = "https://github.com/nickespro130/newpaper/releases";

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Channel {
    Stable,
    Beta,
}

impl Channel {
    pub fn parse(s: &str) -> Channel {
        if s.eq_ignore_ascii_case("beta") { Channel::Beta } else { Channel::Stable }
    }
}

pub fn manifest_url(c: Channel) -> &'static str {
    match c {
        Channel::Stable => "https://github.com/nickespro130/newpaper/releases/latest/download/latest.json",
        Channel::Beta => "https://github.com/nickespro130/newpaper/releases/download/beta/latest.json",
    }
}

pub const CONTENT_MANIFEST_URL: &str = "https://github.com/nickespro130/newpaper/releases/download/content/manifest.json";

/// Instalador NSIS de una versión publicada (para guardar la vuelta atrás).
pub fn installer_url(version: &str) -> String {
    format!("{REPO}/download/v{version}/newpaper_{version}_x64-setup.exe")
}
