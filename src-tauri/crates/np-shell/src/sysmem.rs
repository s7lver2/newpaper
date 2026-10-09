//! Medida de memoria en Windows: la app y todos sus procesos descendientes (los de WebView2 cuelgan de ella).
use std::collections::HashSet;

use windows::Win32::{
    Foundation::CloseHandle,
    System::{
        Diagnostics::ToolHelp::{CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS},
        ProcessStatus::{GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS, PROCESS_MEMORY_COUNTERS_EX},
        SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX},
        Threading::{GetCurrentProcessId, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION},
    },
};

/// Memoria privada (bytes) de esta app y de todos sus procesos hijos.
pub fn process_tree_bytes() -> u64 {
    unsafe {
        let Ok(snap) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else { return 0 };
        let mut pairs: Vec<(u32, u32)> = Vec::new();
        let mut entry = PROCESSENTRY32W { dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32, ..Default::default() };
        if Process32FirstW(snap, &mut entry).is_ok() {
            loop {
                pairs.push((entry.th32ProcessID, entry.th32ParentProcessID));
                if Process32NextW(snap, &mut entry).is_err() {
                    break;
                }
            }
        }
        let _ = CloseHandle(snap);
        let mut tree: HashSet<u32> = HashSet::from([GetCurrentProcessId()]);
        loop {
            let before = tree.len();
            for (pid, parent) in &pairs {
                if tree.contains(parent) {
                    tree.insert(*pid);
                }
            }
            if tree.len() == before {
                break;
            }
        }
        let mut total = 0u64;
        for pid in tree {
            let Ok(h) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else { continue };
            let mut c = PROCESS_MEMORY_COUNTERS_EX { cb: std::mem::size_of::<PROCESS_MEMORY_COUNTERS_EX>() as u32, ..Default::default() };
            if GetProcessMemoryInfo(h, (&mut c as *mut PROCESS_MEMORY_COUNTERS_EX).cast::<PROCESS_MEMORY_COUNTERS>(), c.cb).is_ok() {
                total += c.PrivateUsage as u64;
            }
            let _ = CloseHandle(h);
        }
        total
    }
}

/// RAM física total (bytes).
pub fn total_physical_bytes() -> u64 {
    unsafe {
        let mut s = MEMORYSTATUSEX { dwLength: std::mem::size_of::<MEMORYSTATUSEX>() as u32, ..Default::default() };
        if GlobalMemoryStatusEx(&mut s).is_ok() {
            s.ullTotalPhys
        } else {
            0
        }
    }
}
