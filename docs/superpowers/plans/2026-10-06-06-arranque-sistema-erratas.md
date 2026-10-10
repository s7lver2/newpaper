# Erratas del plan 06 (arranque, sistema y actualizaciones)

Registro de desviaciones respecto al plan y de lo que queda pendiente. Estado: implementación parcial (Tareas 1–16 de código; Tarea 17 y pruebas en la app real no realizadas).

| Tarea | Desviación o error | Corrección o motivo | Commit |
|---|---|---|---|
| 1 | Se añadió un test de `channels` fuera de la política (solo firmas, guardia, manifiesto y migración) | Retirado en `c3f365e` | c3f365e |
| 5 | El plan importaba `crate::commands::{CmdError, CmdResult}`; están en `crate::error` | Uso de `crate::error` | 8848da8 |
| 5 | `crash_report_save` llamaba a `system_info` con un `State` (no compila) | Helper `info(&SystemState)` compartido | 8848da8 |
| 5 | `report` se movía antes de leer `report.at` | Ruta calculada antes del `json!` | 8848da8 |
| 6 | Sin `plugins.updater` en `tauri.conf.json` el plugin no arranca (`pubkey: String` obligatorio) | Bloque añadido con `pubkey` vacía; la clave real llega en la Tarea 9 | fce6a23 |
| 6 | Riesgo de downgrade por respuesta no firmada del endpoint | `requireSignedVersion: true` en la configuración del plugin (releases futuras deben llevar versión firmada) | fce6a23 |
| 6 | `on_exit` usaba `unwrap_or(false)` | `is_ok_and` | 39ef205 |
| 6 | Un `git add` encadenado no añadió los ficheros del comando de registro; quedaron en un commit aparte | Commit de seguimiento `39ef205` (el commit `fce6a23` por sí solo no compila) | 39ef205 |
| 7 | `rsign2` pedía contraseña de forma interactiva y `minisign::generate_encrypted_keypair` también; el primer intento quedó bloqueado | Claves generadas sin cifrar con `minisign::generate_unencrypted_keypair` en `%USERPROFILE%\.newpaper-keys\` (fuera del repo). Pendiente para el propietario: re-generar con contraseña o moverlas a un almacén seguro | 0cb9ee2 |
| 7 | Proceso `keygen.exe` (PID 34108, arranque 13:22) del primer intento sigue bloqueado esperando contraseña. No se pudo cerrar (la denegación del clasificador impidió matarlo) | Ciérrese a mano; no afecta a np-app | — |
| 8 | `bookmarks_scan` devuelve `{ bookmarks, ignored }` en lugar de un array (la UI debe decir cuántos se ignoran) | Cambio de contrato, usado por FirstRun | 3bd3791 |
| 8 | `open_default_apps` con `cmd /C start` | `explorer.exe ms-settings:defaultapps` (sin interpretar argumentos de shell) | 3bd3791 |
| 8 | `first_run_apply` guardaba `"tor"` como texto | Usa `privacy.mode` (`MODE_KEY`) con `NetMode::Tor` | 3bd3791 |
| 8 | Falta `futures` en el crate de la app | Añadido `futures` | 3bd3791 |
| 8 | Test de marcadores (no pedido por la política) | Retirado | f464b23 |
| 9 | `tauri build` no se ejecutó (build de release pesada y bundle sin clave de firma) | Pendiente para la verificación. Con `createUpdaterArtifacts: true`, `tauri build` exige `TAURI_SIGNING_PRIVATE_KEY` | 0d4926f |
| 9 | Clave pública del actualizador generada sin cifrar en `%USERPROFILE%\.newpaper-keys\updater.key`; `pubkey` en `tauri.conf.json` es su base64 | Pendiente: guardar la secreta con contraseña (`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`) | 0d4926f |
| 10 | Los textos se fusionaron desde los bloques JSON del plan; añadida `firstRun.ignored` (es/en/de) | Necesaria para el contador de marcadores ignorados | 6a86b51, 6837a44 |
| 11 | `resetPipeline()` además de `resetRegistry()` al cambiar contenido | El pipeline también guarda la caché de proveedores | 1b3d680 |
| 11 | `import type` en medio de `events.ts` | Movido al inicio | 1b3d680 |
| 13 | `data-tour="lens"` (AnalysisReader), `"neutral"` (AnalysisTab, botón "Versión neutral"), `"tor"` (TorChip) | Como indica la Tarea 13; el selector `.np-ring` y `.np-lens mark` no se verificó en la app | 6837a44 |
| 14 | Test existente de `BrowserShell` esperaba el texto provisional "Esta página interna no existe." | Expectativa actualizada a la 404 nueva ("Esta página no existe"); el test no se borró | 6abef45 |
| 14 | `NotFoundPage` recibe `Partial<InternalPageProps> & { address? }` para ser página interna y superficie de error | Tipado necesario para `registerInternalPage` | 56b53fa |
| 15 | `TicTacToe.tsx` y `ticTacToe.ts` difieren solo en mayúsculas: en Windows (sistema de archivos sin distinción) tsc falla | Componente renombrado a `TicTacToeGame.tsx` | 24e4a8a |
| 15 | Llamadas a `enqueue` en `NoCoverageBlock`, `CoverageTab` y `NewTabPage` (cola sin conexión para `watchAdd` y "leer más tarde") no cableadas | Pendiente; la cola y el vaciado al volver la conexión sí están | — |
| 15 | `flush()` ante un fallo al leer la cola devolvía `[]` y reescribía la cola vacía | Ahora no escribe nada si la lectura falla | 56b53fa |
| 16 | `e2e/specs/tour.e2e.ts` escrito según el plan; no se ejecuta (regla del proyecto: sin e2e en desarrollo) | Pendiente para el agente de verificación | 56b53fa |
| 16 | `startSystemBridge()` y `startOfflineQueue()` se disparan al importar el registro: se añadió `.catch` para no dejar promesas sin capturar | — | 56b53fa |

## Estilo frente a mockups

No se comparó con los artboards de `design/mockups/` (no se levantó `serve.mjs`, por la regla de no ejecutar la app ni hacer verificación visual). Los estilos de Instalador, Recorrido, Errores, 404, Crash y Tres en raya se escribieron con las clases `np-*` y los tokens existentes, y las dimensiones del plan. Hace falta una pasada de fidelidad pixel a pixel.

## Pendiente (no hecho)

- Tarea 17: prueba manual de instalador, actualización, vuelta atrás y contenido (requiere instalar y ejecutar la app; prohibido en este turno).
- Instalador NSIS real (`pnpm tauri build`), firma de `latest.json` con `scripts/release-manifest.mjs`, y `.sig` reales.
- Claves: sustituir las generadas sin cifrar por claves con contraseña; la clave de contenido (`keys/content.pub`) está en el repo y su secreta en `%USERPROFILE%\.newpaper-keys\content.key`.
- Cableado de la cola sin conexión en los tres puntos de la Tarea 15.
- `np-content-sign` solo se compila con `--features sign`; no se ha firmado ningún manifiesto.
- Limitación anotada en el plan (decisión 8): un fallo antes de que corra Rust no se detecta.
