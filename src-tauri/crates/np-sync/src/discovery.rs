//! mDNS `_newpaper._tcp` (§15). Solo anuncia un id aleatorio de dispositivo, el puerto y la versión del protocolo:
//! ni nombre, ni huella, ni datos. Solo se anuncia con la sincronización activada.
use std::{
    collections::HashMap,
    net::{IpAddr, Ipv4Addr},
    sync::{Arc, Mutex},
};

use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};

use crate::{
    identity::{valid_device_id, Identity},
    Result, SyncError,
};

pub const SERVICE: &str = "_newpaper._tcp.local.";
pub const DEFAULT_PORT: u16 = 47100;
/// Tope de dispositivos recordados por mDNS (un anunciante hostil no puede llenar la memoria).
const MAX_DISCOVERED: usize = 256;

/// Tailscale asigna IPv4 de 100.64.0.0/10 (CGNAT).
pub fn is_tailscale(ip: Ipv4Addr) -> bool {
    let o = ip.octets();
    o[0] == 100 && (o[1] & 0xC0) == 64
}

/// Direcciones `ip:puerto` de este equipo: primero las de la LAN y después las de Tailscale.
pub fn local_addresses(port: u16) -> Vec<String> {
    let mut lan = Vec::new();
    let mut ts = Vec::new();
    for iface in if_addrs::get_if_addrs().unwrap_or_default() {
        if iface.is_loopback() {
            continue;
        }
        if let IpAddr::V4(v4) = iface.ip() {
            if v4.is_link_local() {
                continue;
            }
            if is_tailscale(v4) { ts.push(format!("{v4}:{port}")) } else { lan.push(format!("{v4}:{port}")) }
        }
    }
    lan.extend(ts);
    lan
}

pub struct Discovery {
    daemon: ServiceDaemon,
    found: Arc<Mutex<HashMap<String, Vec<String>>>>,
}

impl Discovery {
    pub fn start(me: &Identity, port: u16, advertise: bool) -> Result<Self> {
        let daemon = ServiceDaemon::new().map_err(|e| SyncError::Protocol(e.to_string()))?;
        if advertise {
            let props = [("v", "1")];
            let info = ServiceInfo::new(SERVICE, &me.device_id, &format!("{}.local.", me.device_id), "", port, &props[..])
                .map_err(|e| SyncError::Protocol(e.to_string()))?
                .enable_addr_auto();
            daemon.register(info).map_err(|e| SyncError::Protocol(e.to_string()))?;
        }
        let rx = daemon.browse(SERVICE).map_err(|e| SyncError::Protocol(e.to_string()))?;
        let found: Arc<Mutex<HashMap<String, Vec<String>>>> = Arc::default();
        let sink = found.clone();
        let my_id = me.device_id.clone();
        std::thread::Builder::new().name("np-mdns".into()).spawn(move || {
            while let Ok(ev) = rx.recv() {
                match ev {
                    ServiceEvent::ServiceResolved(r) => {
                        let id = r.fullname.split('.').next().unwrap_or_default().to_string();
                        if id == my_id || !valid_device_id(&id) {
                            continue;
                        }
                        let addrs = r.get_addresses().iter().map(|a| a.to_string()).filter(|a| !a.contains(':')).map(|a| format!("{a}:{}", r.port)).collect();
                        let mut map = sink.lock().expect("lock");
                        if map.len() < MAX_DISCOVERED || map.contains_key(&id) {
                            map.insert(id, addrs);
                        }
                    }
                    ServiceEvent::ServiceRemoved(_, fullname) => {
                        let id = fullname.split('.').next().unwrap_or_default().to_string();
                        sink.lock().expect("lock").remove(&id);
                    }
                    _ => {}
                }
            }
        })?;
        Ok(Self { daemon, found })
    }

    pub fn addresses_of(&self, device_id: &str) -> Vec<String> {
        self.found.lock().expect("lock").get(device_id).cloned().unwrap_or_default()
    }

    pub fn visible(&self) -> Vec<String> {
        self.found.lock().expect("lock").keys().cloned().collect()
    }

    pub fn stop(self) {
        let _ = self.daemon.shutdown();
    }
}
