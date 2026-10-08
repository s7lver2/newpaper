# Erratas del plan 02 (privacidad y red)

Registro de errores encontrados al ejecutar el plan y cómo se corrigieron. Las correcciones ya están aplicadas en el código.

| Tarea | Error | Corrección | Commit |
|---|---|---|---|
| 7 | Tras añadir `pub mod webview2` en `lib.rs`, `cargo clippy -D warnings` marca `map_or(true, …)` (updater.rs) y `chain(extra_rules.into_iter())` (service.rs). El plan pide clippy sin avisos | `is_none_or` y `chain(extra_rules)` | (ver tarea 8) |
| 8 | `cosmetic.js` enviaba los mensajes con `wv.postMessage(objeto)`. El manejador IPC de wry (registrado antes que el de np-shell) solo acepta cadenas: como en la errata 27 del plan 01, los mensajes de objeto no llegan a `win.rs` | El script envía `wv.postMessage(JSON.stringify(msg))`; Rust sigue leyendo `TryGetWebMessageAsString` | (ver registro) |
