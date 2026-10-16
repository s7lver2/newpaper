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

/// Linux: la interfaz de la ruta por defecto es inalámbrica (`/sys/class/net/<if>/wireless`). Sin D-Bus.
#[cfg(target_os = "linux")]
pub fn on_wifi() -> bool {
    linux_power::default_route_iface(&std::fs::read_to_string("/proc/net/route").unwrap_or_default())
        .is_some_and(|iface| std::path::Path::new("/sys/class/net").join(iface).join("wireless").exists())
}

/// Linux: con corriente si no hay batería o algún adaptador de red eléctrica (`Mains`) está conectado.
#[cfg(target_os = "linux")]
pub fn on_ac_power() -> bool {
    let Ok(dir) = std::fs::read_dir("/sys/class/power_supply") else { return true };
    let supplies: Vec<(String, String)> = dir
        .flatten()
        .map(|e| {
            let read = |f: &str| std::fs::read_to_string(e.path().join(f)).unwrap_or_default().trim().to_string();
            (read("type"), read("online"))
        })
        .collect();
    linux_power::on_ac(&supplies)
}

#[cfg(target_os = "linux")]
mod linux_power {
    /// Interfaz de la ruta por defecto en el formato de `/proc/net/route` (destino `00000000`).
    pub fn default_route_iface(route: &str) -> Option<&str> {
        route.lines().skip(1).find_map(|l| {
            let mut c = l.split_whitespace();
            let iface = c.next()?;
            (c.next()? == "00000000").then_some(iface)
        })
    }

    /// `(type, online)` de cada fuente de `/sys/class/power_supply`.
    pub fn on_ac(supplies: &[(String, String)]) -> bool {
        let has_battery = supplies.iter().any(|(t, _)| t == "Battery");
        !has_battery || supplies.iter().any(|(t, o)| t == "Mains" && o == "1")
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn finds_the_default_route_interface() {
            let route = "Iface	Destination	Gateway
wlp3s0	00000000	0100A8C0
wlp3s0	0000A8C0	00000000
";
            assert_eq!(default_route_iface(route), Some("wlp3s0"));
            assert_eq!(default_route_iface("Iface	Destination
"), None);
        }

        #[test]
        fn ac_power_logic() {
            let s = |a: &str, b: &str| (a.to_string(), b.to_string());
            assert!(on_ac(&[]), "a desktop without batteries is always on mains");
            assert!(!on_ac(&[s("Battery", ""), s("Mains", "0")]));
            assert!(on_ac(&[s("Battery", ""), s("Mains", "1")]));
        }
    }
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
