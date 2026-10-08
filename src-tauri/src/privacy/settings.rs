//! Persistencia de los ajustes de red y bloqueo.

use np_adblock::service::AdblockSettings;
use np_net::{NetMode, NetSettings};
use np_store::{Store, StoreError};

pub const MODE_KEY: &str = "privacy.mode";
pub const EXIT_KEY: &str = "privacy.exitCountry";
pub const AI_KEY: &str = "privacy.aiViaTor";
pub const FEEDS_KEY: &str = "privacy.feedsViaTor";
pub const ADBLOCK_KEY: &str = "adblock.settings";

pub fn load_net_settings(store: &Store) -> Result<NetSettings, StoreError> {
    let d = NetSettings::default();
    let mode = match store.get_setting::<serde_json::Value>(MODE_KEY)? {
        Some(v) => serde_json::from_value::<NetMode>(v).unwrap_or(d.mode),
        None => d.mode,
    };
    Ok(NetSettings {
        mode,
        exit_country: store.get_setting::<Option<String>>(EXIT_KEY).unwrap_or(None).flatten(),
        ai_via_tor: store.get_setting::<bool>(AI_KEY).unwrap_or(None).unwrap_or(d.ai_via_tor),
        feeds_via_tor: store.get_setting::<bool>(FEEDS_KEY).unwrap_or(None).unwrap_or(d.feeds_via_tor),
    })
}

pub fn save_net_settings(store: &Store, s: &NetSettings) -> Result<(), StoreError> {
    store.set_setting(MODE_KEY, &s.mode)?;
    store.set_setting(EXIT_KEY, &s.exit_country)?;
    store.set_setting(AI_KEY, &s.ai_via_tor)?;
    store.set_setting(FEEDS_KEY, &s.feeds_via_tor)
}

pub fn load_adblock_settings(store: &Store) -> Result<AdblockSettings, StoreError> {
    Ok(store.get_setting::<AdblockSettings>(ADBLOCK_KEY).unwrap_or(None).unwrap_or_default())
}

pub fn save_adblock_settings(store: &Store, s: &AdblockSettings) -> Result<(), StoreError> {
    store.set_setting(ADBLOCK_KEY, s)
}

#[cfg(test)]
mod tests {
    use super::*;
    use np_net::NetMode;

    #[test]
    fn defaults_when_nothing_is_stored() {
        let s = Store::open_in_memory().unwrap();
        assert_eq!(load_net_settings(&s).unwrap(), NetSettings::default());
        assert_eq!(load_adblock_settings(&s).unwrap(), AdblockSettings::default());
    }

    #[test]
    fn round_trips_through_individual_keys() {
        let s = Store::open_in_memory().unwrap();
        let n = NetSettings { mode: NetMode::Tor, exit_country: Some("DE".into()), ai_via_tor: true, feeds_via_tor: false };
        save_net_settings(&s, &n).unwrap();
        assert_eq!(s.get_setting::<String>(MODE_KEY).unwrap().as_deref(), Some("tor"));
        assert_eq!(s.get_setting::<Option<String>>(EXIT_KEY).unwrap(), Some(Some("DE".into())));
        assert_eq!(load_net_settings(&s).unwrap(), n);
    }

    #[test]
    fn ignores_garbage_and_falls_back_to_defaults() {
        let s = Store::open_in_memory().unwrap();
        s.set_setting(MODE_KEY, &"wireguard").unwrap();
        assert_eq!(load_net_settings(&s).unwrap().mode, NetMode::Direct);
    }
}
