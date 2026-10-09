//! Protección SSRF: hosts que nunca son un destino legítimo para descargas iniciadas por la IA.
use std::net::{Ipv4Addr, Ipv6Addr};

use url::{Host, Url};

fn private_v4(ip: Ipv4Addr) -> bool {
    let o = ip.octets();
    ip.is_loopback()
        || ip.is_private()
        || ip.is_link_local() // incluye 169.254.169.254 (metadatos cloud)
        || ip.is_unspecified()
        || ip.is_broadcast()
        || ip.is_multicast()
        || o[0] == 0
        || (o[0] == 100 && (64..128).contains(&o[1])) // CGNAT
        || (o[0] == 192 && o[1] == 0 && o[2] == 0)
        || (o[0] == 198 && (o[1] == 18 || o[1] == 19))
        || o[0] >= 240
}

fn private_v6(ip: Ipv6Addr) -> bool {
    if let Some(v4) = ip.to_ipv4_mapped() {
        return private_v4(v4);
    }
    let seg = ip.segments();
    ip.is_loopback()
        || ip.is_unspecified()
        || ip.is_multicast()
        || (seg[0] & 0xfe00) == 0xfc00 // ULA
        || (seg[0] & 0xffc0) == 0xfe80 // link-local
        || (seg[0] == 0x64 && seg[1] == 0xff9b) // NAT64
}

/// `true` si el host es `localhost`, un nombre interno o una IP literal privada/reservada.
pub fn is_private_host(url: &Url) -> bool {
    match url.host() {
        None => true,
        Some(Host::Ipv4(ip)) => private_v4(ip),
        Some(Host::Ipv6(ip)) => private_v6(ip),
        Some(Host::Domain(d)) => {
            let d = d.trim_end_matches('.').to_ascii_lowercase();
            d == "localhost" || d.ends_with(".localhost") || d.ends_with(".local") || d.ends_with(".internal") || d.ends_with(".lan") || d.ends_with(".home.arpa") || !d.contains('.')
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flags_private_and_metadata_hosts_in_every_literal_form() {
        for u in [
            "http://127.0.0.1/", "http://localhost/", "http://foo.localhost/", "http://169.254.169.254/latest/meta-data", "http://10.0.0.5/",
            "http://192.168.1.1/", "http://172.16.0.1/", "http://[::1]/", "http://[fd00::1]/", "http://[::ffff:127.0.0.1]/", "http://2130706433/",
            "http://0x7f.1/", "http://0.0.0.0/", "http://100.64.0.1/", "http://intranet/", "http://printer.local/", "http://metadata.google.internal/",
        ] {
            assert!(is_private_host(&Url::parse(u).unwrap()), "{u}");
        }
        for u in ["https://www.ine.es/", "https://93.184.216.34/", "https://[2606:2800:220:1:248:1893:25c8:1946]/"] {
            assert!(!is_private_host(&Url::parse(u).unwrap()), "{u}");
        }
    }
}
