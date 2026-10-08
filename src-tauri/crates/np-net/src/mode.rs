//! Modos de red, estado de Tor y reglas de enrutado (spec §4.2).

use serde::{Deserialize, Serialize};

use crate::NetError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NetMode {
    Direct,
    Tor,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct NetSettings {
    pub mode: NetMode,
    pub exit_country: Option<String>,
    pub ai_via_tor: bool,
    pub feeds_via_tor: bool,
}

impl Default for NetSettings {
    fn default() -> Self {
        Self { mode: NetMode::Direct, exit_country: None, ai_via_tor: false, feeds_via_tor: true }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum TorState {
    Off,
    Bootstrapping { percent: u8 },
    Ready,
    Failed { message: String },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetStatus {
    pub mode: NetMode,
    pub tor: TorState,
    pub socks_port: u16,
    pub exit_country: Option<String>,
    pub circuit: u64,
    pub ai_via_tor: bool,
    pub feeds_via_tor: bool,
    pub kill_switch_active: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Traffic {
    /// Páginas, imágenes del lector, hemeroteca, búsquedas de respaldo.
    Web,
    Feeds,
    Ai,
    Updates,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Route {
    Direct,
    Tor,
}

pub fn route(s: &NetSettings, t: Traffic) -> Route {
    if s.mode == NetMode::Direct {
        return Route::Direct;
    }
    match t {
        Traffic::Web | Traffic::Updates => Route::Tor,
        Traffic::Feeds if s.feeds_via_tor => Route::Tor,
        Traffic::Ai if s.ai_via_tor => Route::Tor,
        _ => Route::Direct,
    }
}

pub fn normalize_country(cc: &str) -> Result<String, NetError> {
    let c = cc.trim();
    if c.len() == 2 && c.chars().all(|ch| ch.is_ascii_alphabetic()) {
        Ok(c.to_ascii_uppercase())
    } else {
        Err(NetError::InvalidCountry(cc.to_string()))
    }
}

pub fn compose_status(s: &NetSettings, tor: &TorState, socks_port: u16, circuit: u64) -> NetStatus {
    NetStatus {
        mode: s.mode,
        tor: tor.clone(),
        socks_port,
        exit_country: s.exit_country.clone(),
        circuit,
        ai_via_tor: s.ai_via_tor,
        feeds_via_tor: s.feeds_via_tor,
        kill_switch_active: s.mode == NetMode::Tor && *tor != TorState::Ready,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_follow_the_spec() {
        let s = NetSettings::default();
        assert_eq!(s.mode, NetMode::Direct);
        assert!(s.feeds_via_tor, "RSS por Tor por defecto");
        assert!(!s.ai_via_tor, "IA directa por defecto");
    }

    #[test]
    fn routing_table() {
        let mut s = NetSettings::default();
        for t in [Traffic::Web, Traffic::Feeds, Traffic::Ai, Traffic::Updates] {
            assert_eq!(route(&s, t), Route::Direct);
        }
        s.mode = NetMode::Tor;
        assert_eq!(route(&s, Traffic::Web), Route::Tor);
        assert_eq!(route(&s, Traffic::Updates), Route::Tor);
        assert_eq!(route(&s, Traffic::Feeds), Route::Tor);
        assert_eq!(route(&s, Traffic::Ai), Route::Direct);
        s.ai_via_tor = true;
        s.feeds_via_tor = false;
        assert_eq!(route(&s, Traffic::Ai), Route::Tor);
        assert_eq!(route(&s, Traffic::Feeds), Route::Direct);
    }

    #[test]
    fn countries_are_two_ascii_letters() {
        assert_eq!(normalize_country("de").unwrap(), "DE");
        assert!(normalize_country("DEU").is_err());
        assert!(normalize_country("d3").is_err());
        assert!(normalize_country("").is_err());
    }

    #[test]
    fn kill_switch_is_active_in_tor_mode_until_ready() {
        let mut s = NetSettings::default();
        assert!(!compose_status(&s, &TorState::Off, 9050, 0).kill_switch_active);
        s.mode = NetMode::Tor;
        assert!(compose_status(&s, &TorState::Bootstrapping { percent: 40 }, 9050, 0).kill_switch_active);
        assert!(compose_status(&s, &TorState::Failed { message: "x".into() }, 9050, 0).kill_switch_active);
        assert!(!compose_status(&s, &TorState::Ready, 9050, 0).kill_switch_active);
    }

    #[test]
    fn status_serializes_for_the_ui() {
        let s = NetSettings { mode: NetMode::Tor, exit_country: Some("DE".into()), ..Default::default() };
        let v = serde_json::to_value(compose_status(&s, &TorState::Bootstrapping { percent: 12 }, 50123, 3)).unwrap();
        assert_eq!(v["mode"], "tor");
        assert_eq!(v["tor"]["state"], "bootstrapping");
        assert_eq!(v["tor"]["percent"], 12);
        assert_eq!(v["socksPort"], 50123);
        assert_eq!(v["exitCountry"], "DE");
        assert_eq!(v["killSwitchActive"], true);
    }
}
