//! Edición del día: comprueba cada minuto si toca construirla y avisa a la UI.
use std::{sync::Arc, time::Duration};

use np_feeds::offline::{should_build, OfflineSettings};
use np_store::Store;
use tauri::{AppHandle, Emitter, Manager};

pub const LAST_BUILT_KEY: &str = "device.offline.lastBuilt";

#[cfg(windows)]
pub fn on_wifi() -> bool {
    use windows::Networking::Connectivity::NetworkInformation;
    NetworkInformation::GetInternetConnectionProfile().and_then(|p| p.IsWlanConnectionProfile()).unwrap_or(false)
}

#[cfg(windows)]
pub fn on_ac_power() -> bool {
    use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
    let mut st = SYSTEM_POWER_STATUS::default();
    unsafe { GetSystemPowerStatus(&mut st) }.is_ok() && st.ACLineStatus == 1
}

/// Linux: NetworkManager dice si la conexión principal es Wi-Fi. Sin D-Bus o sin NetworkManager, `true`
/// (la edición se construye: es lo que hacía antes el portado).
#[cfg(target_os = "linux")]
pub fn on_wifi() -> bool {
    dbus_property("org.freedesktop.NetworkManager", "/org/freedesktop/NetworkManager", "org.freedesktop.NetworkManager", "PrimaryConnectionType")
        .map_or(true, |t| t == "802-11-wireless")
}

/// Linux: UPower dice si el equipo funciona con batería. Sin D-Bus o sin UPower, `true`.
#[cfg(target_os = "linux")]
pub fn on_ac_power() -> bool {
    dbus_property("org.freedesktop.UPower", "/org/freedesktop/UPower", "org.freedesktop.UPower", "OnBattery")
        .map_or(true, |on_battery| on_battery == "false")
}

/// Lee una propiedad D-Bus del bus del sistema como texto (`true`/`false` para booleanos).
#[cfg(target_os = "linux")]
fn dbus_property(dest: &str, path: &str, iface: &str, prop: &str) -> Option<String> {
    use zbus::zvariant::OwnedValue;
    let conn = zbus::blocking::Connection::system().ok()?;
    let proxy = zbus::blocking::fdo::PropertiesProxy::builder(&conn)
        .destination(dest).ok()?
        .path(path).ok()?
        .build().ok()?;
    let value: OwnedValue = proxy.get(iface.try_into().ok()?, prop).ok()?;
    if let Ok(s) = <&str>::try_from(&value) {
        return Some(s.to_string());
    }
    bool::try_from(&value).ok().map(|b| b.to_string())
}

#[cfg(not(any(windows, target_os = "linux")))]
pub fn on_wifi() -> bool {
    true
}

#[cfg(not(any(windows, target_os = "linux")))]
pub fn on_ac_power() -> bool {
    true
}

pub fn spawn(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut requested: Option<String> = None;
        loop {
            tokio::time::sleep(Duration::from_secs(60)).await;
            let store = app.state::<Arc<Store>>().inner().clone();
            let settings = OfflineSettings::load(&store).unwrap_or_default();
            let now = chrono::Local::now();
            let today = now.format("%Y-%m-%d").to_string();
            let last = store.get_setting::<String>(LAST_BUILT_KEY).ok().flatten();
            let wifi = !settings.wifi_only || on_wifi();
            let ac = !settings.ac_only || on_ac_power();
            if requested.as_deref() != Some(&today) && should_build(&today, &now.format("%H:%M").to_string(), &settings, last.as_deref(), wifi, ac) {
                requested = Some(today.clone());
                let _ = app.emit_to("ui", "offline://build-requested", serde_json::json!({ "date": today }));
            }
        }
    });
}
