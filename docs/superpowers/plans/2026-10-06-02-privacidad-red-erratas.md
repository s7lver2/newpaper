# Erratas del plan 02 (privacidad y red)

Registro de errores encontrados al ejecutar el plan y cómo se corrigieron. Las correcciones ya están aplicadas en el código.

| Tarea | Error | Corrección | Commit |
|---|---|---|---|
| 7 | Tras añadir `pub mod webview2` en `lib.rs`, `cargo clippy -D warnings` marca `map_or(true, …)` (updater.rs) y `chain(extra_rules.into_iter())` (service.rs). El plan pide clippy sin avisos | `is_none_or` y `chain(extra_rules)` | (ver tarea 8) |
| 8 | `cosmetic.js` enviaba los mensajes con `wv.postMessage(objeto)`. El manejador IPC de wry (registrado antes que el de np-shell) solo acepta cadenas: como en la errata 27 del plan 01, los mensajes de objeto no llegan a `win.rs` | El script envía `wv.postMessage(JSON.stringify(msg))`; Rust sigue leyendo `TryGetWebMessageAsString` | (ver registro) |
| 12 | `cargo test -p np-net` falla al enlazar: `LNK1181: no se puede abrir 'sqlite3.lib'`. `tor-dirmgr` usa `rusqlite` sin `bundled`, y sin dependencia directa en el crate no se unifica la feature del workspace | `rusqlite = { workspace = true }` en `np-net/Cargo.toml` (con comentario) | (ver registro) |
| 12 | `c.connect(...).await.unwrap_err()` en el test no compila: `Result<BoxStream, _>` exige `Debug` sobre `dyn AsyncStream` | El test usa `let Err(err) = … else { panic!() }` | (ver registro) |
