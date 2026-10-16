//! Medida de memoria en Linux: la app y todos sus procesos descendientes (los procesos web y de red de WebKitGTK
//! cuelgan de ella). Solo `/proc`, sin dependencias. Equivale a `sysmem.rs` de Windows (memoria privada).
use std::{collections::HashMap, fs, path::Path};

/// `(pid, ppid)` leído de `/proc/<pid>/stat`. El nombre del proceso va entre paréntesis y puede contener espacios y
/// paréntesis: se busca el último `)`.
pub(crate) fn parse_stat_ppid(stat: &str) -> Option<u32> {
    let rest = stat.get(stat.rfind(')')? + 1..)?;
    // Tras el nombre: estado, ppid, ...
    rest.split_whitespace().nth(1)?.parse().ok()
}

/// Bytes de memoria anónima residente (`RssAnon`, en kB en `/proc/<pid>/status`): lo privado del proceso, sin las
/// bibliotecas compartidas que cuentan varias veces en `VmRSS`.
pub(crate) fn parse_rss_anon_bytes(status: &str) -> Option<u64> {
    let line = status.lines().find(|l| l.starts_with("RssAnon:"))?;
    let kb: u64 = line.split_whitespace().nth(1)?.parse().ok()?;
    Some(kb * 1024)
}

/// `MemTotal` de `/proc/meminfo`, en bytes.
pub(crate) fn parse_mem_total_bytes(meminfo: &str) -> Option<u64> {
    let line = meminfo.lines().find(|l| l.starts_with("MemTotal:"))?;
    let kb: u64 = line.split_whitespace().nth(1)?.parse().ok()?;
    Some(kb * 1024)
}

fn tree_bytes(proc_root: &Path, root: u32) -> u64 {
    let mut parents: HashMap<u32, u32> = HashMap::new();
    let Ok(entries) = fs::read_dir(proc_root) else { return 0 };
    for e in entries.flatten() {
        let Some(pid) = e.file_name().to_str().and_then(|n| n.parse::<u32>().ok()) else { continue };
        if let Some(ppid) = fs::read_to_string(e.path().join("stat")).ok().and_then(|s| parse_stat_ppid(&s)) {
            parents.insert(pid, ppid);
        }
    }
    let mut tree = vec![root];
    let mut i = 0;
    while i < tree.len() {
        let parent = tree[i];
        for (pid, ppid) in &parents {
            if *ppid == parent && !tree.contains(pid) {
                tree.push(*pid);
            }
        }
        i += 1;
    }
    tree.iter()
        .filter_map(|pid| fs::read_to_string(proc_root.join(pid.to_string()).join("status")).ok())
        .filter_map(|s| parse_rss_anon_bytes(&s))
        .sum()
}

/// Memoria privada (bytes) de esta app y de todos sus procesos hijos.
pub fn process_tree_bytes() -> u64 {
    tree_bytes(Path::new("/proc"), std::process::id())
}

/// RAM física total (bytes).
pub fn total_physical_bytes() -> u64 {
    fs::read_to_string("/proc/meminfo").ok().and_then(|s| parse_mem_total_bytes(&s)).unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_ppid_even_with_odd_process_names() {
        assert_eq!(parse_stat_ppid("1234 (bash) S 1000 1234 1234 0 -1"), Some(1000));
        assert_eq!(parse_stat_ppid("77 (Web Content (x) y) R 42 77"), Some(42));
        assert_eq!(parse_stat_ppid("garbage"), None);
    }

    #[test]
    fn parses_private_resident_memory_and_total_ram() {
        assert_eq!(parse_rss_anon_bytes("Name:\tx\nRssAnon:\t   2048 kB\nRssFile:\t10 kB\n"), Some(2048 * 1024));
        assert_eq!(parse_rss_anon_bytes("Name:\tx\n"), None);
        assert_eq!(parse_mem_total_bytes("MemTotal:       16384 kB\nMemFree: 1 kB\n"), Some(16384 * 1024));
    }

    #[test]
    fn sums_the_process_tree_from_a_fake_proc() {
        let dir = std::env::temp_dir().join(format!("np-sysmem-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        for (pid, ppid, kb) in [(10, 1, 100), (11, 10, 200), (12, 11, 300), (13, 99, 5000)] {
            let p = dir.join(pid.to_string());
            fs::create_dir_all(&p).unwrap();
            fs::write(p.join("stat"), format!("{pid} (x) S {ppid} 0 0")).unwrap();
            fs::write(p.join("status"), format!("Name:\tx\nRssAnon:\t{kb} kB\n")).unwrap();
        }
        assert_eq!(tree_bytes(&dir, 10), 600 * 1024); // 10 + 11 + 12; el 13 es de otro árbol
        let _ = fs::remove_dir_all(&dir);
    }
}
