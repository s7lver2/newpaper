# Erratas del plan 02 (privacidad y red)

Registro de errores encontrados al ejecutar el plan y cómo se corrigieron. Las correcciones ya están aplicadas en el código.

| Tarea | Error | Corrección | Commit |
|---|---|---|---|
| 7 | Tras añadir `pub mod webview2` en `lib.rs`, `cargo clippy -D warnings` marca `map_or(true, …)` (updater.rs) y `chain(extra_rules.into_iter())` (service.rs). El plan pide clippy sin avisos | `is_none_or` y `chain(extra_rules)` | (ver tarea 8) |
| 8 | `cosmetic.js` enviaba los mensajes con `wv.postMessage(objeto)`. El manejador IPC de wry (registrado antes que el de np-shell) solo acepta cadenas: como en la errata 27 del plan 01, los mensajes de objeto no llegan a `win.rs` | El script envía `wv.postMessage(JSON.stringify(msg))`; Rust sigue leyendo `TryGetWebMessageAsString` | (ver registro) |
| 12 | `cargo test -p np-net` falla al enlazar: `LNK1181: no se puede abrir 'sqlite3.lib'`. `tor-dirmgr` usa `rusqlite` sin `bundled`, y sin dependencia directa en el crate no se unifica la feature del workspace | `rusqlite = { workspace = true }` en `np-net/Cargo.toml` (con comentario) | (ver registro) |
| 12 | `c.connect(...).await.unwrap_err()` en el test no compila: `Result<BoxStream, _>` exige `Debug` sobre `dyn AsyncStream` | El test usa `let Err(err) = … else { panic!() }` | (ver registro) |
| 13 | `NetController::start` pasa `Some(cc)` con `cc: &String` a `set_exit_country(Option<&str>)`: no compila (E0308) | `Some(cc.as_str())` | (ver registro) |
| 18 | El test del popup de Tor pulsa "Salir por cualquier país" justo después de "Salir por Países Bajos". Durante 900 ms ese botón muestra "Cambiando de salida…" y está deshabilitado, así que el test falla | El test espera a que el botón recupere su texto con `findByRole` (timeout 2 s) | 5668657 |
| 18 | El test de `TorChip` usa `rerender(<TorChip/>)` tras `renderWithI18n`, que no envuelve en `I18nProvider`: `useI18n must be used inside <I18nProvider>`. El store ya re-renderiza por suscripción | Se eliminan los `rerender`; los cambios de estado se aplican con `act(() => applyStatus(...))` | 5668657 |
| 19 | `Button` de ui-kit no tipa `ref`: su firma usa `ButtonHTMLAttributes`, que no lo incluye, así que `<Button ref={…}>` (usado por el diálogo) no es válido para el tipo | Se añade `ref?: Ref<HTMLButtonElement>` a la firma y se pasa explícitamente al `<button>` | a959645 |

## Revisión visual y de conformidad (UI de privacidad y red)

Revisado en un harness con `__TAURI_INTERNALS__` simulado (navegador integrado, temas papel/tinta, es/de). No se pudo comparar con los mockups `.dc.html` de newpaper: no están en el repositorio (solo la pizarra en claude.ai); se contrastó con los tokens `--np-*` y el spec §4/§8. Nada de esto está verificado en WebView2 real.

| Área | Desajuste | Corrección | Commit |
|---|---|---|---|
| Ajustes › Red | El "mapa" eran 17 puntos agrupados sin contexto | `DotMap` dibuja una rejilla de tierra (contornos simplificados) con los países de salida resaltados | 8726c47 |
| Ajustes › Red | La ruta y "Circuito n.º N" aparecían pegados en una línea | El circuito va en su propia fila con el botón "Nuevo circuito" | 8726c47 |
| Popup de Tor | Nombre del país y "Salida actual" en la misma línea sin separar | `.np-tor-candidate` apila los textos | 8726c47 |
| Popup de Tor | Ofrecía "abrir sin Tor" en una pestaña que ya lo estaba | Se oculta si la pestaña está en `tabsWithoutTor` | 8726c47 |
| Ajustes › Bloqueo | Interruptores aplastados y desalineados en las filas de listas (texto largo, de) | Fila en una columna con la meta debajo; `.np-switch { flex: none }` | 8726c47 |
| ui-kit | Botón primario deshabilitado seguía con fondo de tinta | Fondo `--np-soft` en `.np-btn--primary:disabled` | 8726c47 |
| Escudo y chip de Tor | Los popovers solo se cerraban con Esc | Cierre al pulsar fuera | 8726c47 |
| Diálogo sin Tor | `aria-modal` sin trampa de foco; párrafo con margen extra | Tab/Shift+Tab cíclico dentro del diálogo; `p { margin: 0 }` | 8726c47 |
| i18n de | "Über {país} hinaus" no se entiende como "salir por" | "Ausgang über {país}" | 8726c47 |
