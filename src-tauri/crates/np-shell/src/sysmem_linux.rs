//! Medida de memoria en Linux: la app y todos sus procesos descendientes (los de WebKitGTK cuelgan de ella),
//! leída de `/proc`. Se usa la memoria proporcional (PSS) cuando está disponible y RSS si no.
use std::{
    collections::HashMap,
    fs,
    path::Path,
};

const PROC: &str = "/proc";

/// Memoria (bytes) de esta app y de todos sus procesos hijos.
pub fn process_tree_bytes() -> u64 {
    tree_bytes(Path::new(PROC), std::process::id())
}

/// RAM física total (bytes), de `/proc/meminfo`.
pub fn total_physical_bytes() -> u64 {
    fs::read_to_string(Path::new(PROC).join("meminfo"))
        .ok()
        .and_then(|t| kb_field(&t, "MemTotal:"))
        .map_or(0, |kb| kb * 1024)
}

fn tree_bytes(proc_root: &Path, root_pid: u32) -> u64 {
    let mut children: HashMap<u32, Vec<u32>> = HashMap::new();
    for (pid, ppid) in read_parents(proc_root) {
        children.entry(ppid).or_default().push(pid);
    }
    let mut total = 0u64;
    let mut stack = vec![root_pid];
    while let Some(pid) = stack.pop() {
        total += process_bytes(proc_root, pid);
        if let Some(kids) = children.get(&pid) {
            stack.extend(kids.iter().copied());
        }
    }
    total
}

/// Pares (pid, ppid) de todos los procesos visibles.
fn read_parents(proc_root: &Path) -> Vec<(u32, u32)> {
    let Ok(entries) = fs::read_dir(proc_root) else { return Vec::new() };
    entries
        .filter_map(Result::ok)
        .filter_map(|e| e.file_name().to_str()?.parse::<u32>().ok())
        .filter_map(|pid| {
            let stat = fs::read_to_string(proc_root.join(pid.to_string()).join("stat")).ok()?;
            Some((pid, parent_pid(&stat)?))
        })
        .collect()
}

/// El campo 4 de `/proc/<pid>/stat` es el ppid; el nombre (campo 2) va entre paréntesis y puede
/// contener espacios o paréntesis, así que se parte por el último `)`.
fn parent_pid(stat: &str) -> Option<u32> {
    let after = &stat[stat.rfind(')')? + 1..];
    // Tras el `)`: estado y luego ppid.
    after.split_whitespace().nth(1)?.parse().ok()
}

fn process_bytes(proc_root: &Path, pid: u32) -> u64 {
    let dir = proc_root.join(pid.to_string());
    if let Ok(rollup) = fs::read_to_string(dir.join("smaps_rollup")) {
        if let Some(kb) = kb_field(&rollup, "Pss:") {
            return kb * 1024;
        }
    }
    fs::read_to_string(dir.join("status"))
        .ok()
        .and_then(|t| kb_field(&t, "VmRSS:"))
        .map_or(0, |kb| kb * 1024)
}

/// Valor en kB de la línea que empieza por `key` (p. ej. `Pss:    1234 kB`).
fn kb_field(text: &str, key: &str) -> Option<u64> {
    text.lines()
        .find(|l| l.starts_with(key))?
        .split_whitespace()
        .nth(1)?
        .parse()
        .ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(path: std::path::PathBuf, content: &str) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, content).unwrap();
    }

    fn proc_entry(root: &Path, pid: u32, ppid: u32, comm: &str, pss_kb: u64) {
        let dir = root.join(pid.to_string());
        write(dir.join("stat"), &format!("{pid} ({comm}) S {ppid} 1 1 0 -1 4194560 0 0"));
        write(dir.join("smaps_rollup"), &format!("Rss:  9999 kB\nPss:  {pss_kb} kB\n"));
        write(dir.join("status"), &format!("Name:\tx\nVmRSS:\t{} kB\n", pss_kb + 1));
    }

    #[test]
    fn parent_pid_handles_names_with_spaces_and_parens() {
        assert_eq!(parent_pid("42 (web content) S 7 42 42 0"), Some(7));
        assert_eq!(parent_pid("42 (a (weird) name) R 9 1 1"), Some(9));
        assert_eq!(parent_pid("garbage"), None);
    }

    #[test]
    fn tree_sums_descendants_only() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        proc_entry(root, 100, 1, "newpaper", 1000); // la app
        proc_entry(root, 101, 100, "WebKitWebProcess", 200); // hijo
        proc_entry(root, 102, 101, "WebKitNetworkProcess", 300); // nieto
        proc_entry(root, 200, 1, "firefox", 5000); // ajeno
        assert_eq!(tree_bytes(root, 100), (1000 + 200 + 300) * 1024);
    }

    #[test]
    fn falls_back_to_rss_without_smaps_rollup() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        write(root.join("5/stat"), "5 (x) S 1 5 5");
        write(root.join("5/status"), "VmRSS:\t 64 kB\n");
        assert_eq!(tree_bytes(root, 5), 64 * 1024);
    }

    #[test]
    fn missing_pid_counts_as_zero() {
        let tmp = tempfile::tempdir().unwrap();
        assert_eq!(tree_bytes(tmp.path(), 77), 0);
    }

    #[test]
    fn meminfo_total_is_parsed() {
        assert_eq!(kb_field("MemTotal:       16308 kB\nMemFree: 1 kB\n", "MemTotal:"), Some(16308));
        assert_eq!(kb_field("MemFree: 1 kB\n", "MemTotal:"), None);
    }
}
