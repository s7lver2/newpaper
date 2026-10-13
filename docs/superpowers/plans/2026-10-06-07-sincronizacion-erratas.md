# Erratas del plan 07 (sincronización)

Registro de desviaciones y errores encontrados al implementar el plan y cómo se corrigieron. El texto del plan no se ha reescrito.

## Tareas de código

| Tarea | Error o desviación | Corrección | Commit |
|---|---|---|---|
| 2 | Los disparadores `AFTER UPDATE` con `INSERT OR REPLACE INTO sync_journal` fallaban al segundo cambio de una fila (`UNIQUE constraint failed: sync_journal.tbl, sync_journal.row_id`); rompía cualquier escritura de ajustes (`set_setting` por segunda vez) y 3 tests de np-store | Los disparadores borran la entrada previa y vuelven a insertar (`DELETE` + `INSERT`): una entrada por fila con la secuencia más reciente, como pide el plan. Causa exacta de SQLite no investigada a fondo | d4b1a43 |
| 3 | `apply` con `INSERT OR REPLACE` dejaría índices FTS obsoletos en `history` (el reemplazo no dispara el borrado del FTS) y un choque de clave natural (mismo dominio en dos equipos en `custom_outlets`) abortaría toda la sincronización | Filas existentes: `UPDATE OR IGNORE ... WHERE id = ?` (dispara los disparadores FTS); filas nuevas: `INSERT OR IGNORE`. Un choque de clave natural se omite en vez de bloquear la sincronización. Los tests del plan no cambian | 7637215 |
| 4 | El plan lee `ai.connected` y las claves `ai.<proveedor>`; el proveedor puede llevar `:` (`custom:…`), que el llavero guarda como `-` (`np-ai-proxy::secret_key`) | `key_names` aplica la misma sustitución `:` → `-` | bc906cf |
| 4 | `tests/protocol.rs`: `pair_with(&mut b, &ctx("intruso"), …)` deja un temporal prestado dentro de `tokio::join!` (E0716) y el import `SecretStore` sobra | Contexto del intruso en una variable; se quita el import no usado. Ningún test cambia | bc906cf |
| 7 | El plan usa `tokio::net` en la app sin declararlo en `np-app` (solo llegaba por la unificación de features con np-sync) | `tokio` de `np-app` con `features = ["net", "io-util"]` explícito | fa7c500 |
| 7 | `tauri-plugin-dialog` no estaba en `src-tauri/Cargo.toml` | Añadido `=2.8.1`; plugin registrado en `lib.rs` | fa7c500 |
| 8 | El plan importa `crate::commands::{CmdError, CmdResult}`; están en `crate::error` (ya señalado en el plan 06) | Import desde `crate::error` | fa7c500 |
| 7–8 | Tareas 7 y 8 en un solo commit: `lib.rs` contiene a la vez el módulo, el plugin y los comandos del `generate_handler!` | Commit combinado para no dejar un `lib.rs` a medias | fa7c500 |
| 8 | `capabilities/ui.json` se reformateaba entero al editarlo con JSON | Edición de texto mínima (una línea añadida) para no ensuciar el diff | fa7c500 |
| 9 | Lista de textos del plan insuficiente para el mockup `Sincronizar` (etiquetas de tarjetas, estados de emparejamiento, vías de conexión, descripciones de ámbitos, cuenta de ámbitos, resumen de Ajustes) | Claves nuevas en `sync.*` (es/en/de), con el mismo texto del mockup donde existe. Ver lista abajo | 672109d, 3292fac |
| 9 | "Artículos guardados" (mockup) frente a "Guardados" (plan) | Se usa el texto del mockup | 672109d |
| 9 | Texto de revocar del mockup: "se borrará su clave de este PC" | No es cierto con el backend (revocar solo marca el par y olvida sus direcciones; las claves ya recibidas siguen en el llavero). Texto ajustado a lo que hace el código | 672109d |
| 10 | El mockup fija los ámbitos de forma global; el plan y el backend los guardan por dispositivo (`sync_peers.scopes`) | Los ámbitos y el interruptor de claves van dentro de cada tarjeta de dispositivo, con los mismos interruptores y textos del mockup | 3292fac |
| 10 | El mockup simula el emparejamiento con temporizadores (pasos, "buscando", comparación de huellas) | No se implementa la simulación: la UI refleja solo el estado real (oferta activa con cuenta atrás, o inactiva) | 3292fac |
| 10 | Clases `np-field` y `np-wizard-actions` del plan no existen en ningún CSS (errata 06) | Clases propias de la sección (`np-dev-field`, `np-dev-actions`) | 3292fac |
| 10 | Frase de paso: el mockup pide "al menos 4 palabras" y muestra medidor de fuerza; el plan y el backend exigen 8 caracteres | Se mantiene el mínimo de 8 caracteres del plan; sin medidor | 3292fac |
| 10 | El QR del mockup lleva una insignia "np" en el centro | No se dibuja (el lector de QR tolera la ausencia; se evita texto a mano en el SVG) | 3292fac |
| 10 | El mockup trae una entrada de navegación de Ajustes sin resumen | `DevicesSummary` muestra "Sin dispositivos" o el número de emparejados | 3292fac |
| 10 | Las `Summary` de Ajustes son componentes sin props: el resumen carga los pares por su cuenta | Se llama a `sync_peers` una vez al montar | 3292fac |
| 7 | Si el llavero de Windows no responde, `Identity::load_or_create(...)?` impedía arrancar la app | Se registra un aviso y la app arranca con una identidad temporal de la sesión (los pares se pierden al cerrar) | 7b2064d |

## Desviaciones de diseño que se mantienen

- **Transporte: TCP directo, no por Tor.** La instrucción del encargo decía "pasa por la capa de red existente (Tor / kill switch)", pero el plan (decisión 7 y restricciones globales) dice "TCP directo en el puerto 47100, nunca por Tor ni por terceros". Se sigue el plan: el kill switch y el proxy SOCKS no aplican a la sincronización. Pendiente de decisión del propietario.
- **Escucha en `0.0.0.0:47100` solo con la sincronización activada.** Windows pedirá permiso de cortafuegos la primera vez. Un par desconocido recibe solo `Reject` y ningún dato.
- **Importar `.npsync` no notifica a los observadores de ajustes.** `apply` escribe en SQLite sin pasar por `set_setting`, así que los cambios importados se ven al reiniciar (o al tocar el ajuste). No verificado en la app.
- **`sync_export` y `sync_import` reciben una ruta desde la UI.** La ruta la elige el diálogo nativo del usuario; el permiso `allow-sync-*` es el mismo que el resto de comandos de la UI.
- **Revocar no borra las claves recibidas.** Las claves de API ya copiadas siguen en el llavero de este equipo; el plan no pide borrarlas.
- **Sincronización de la app en el arranque:** `sync::setup` crea la identidad (`sync.identity`) en el llavero de Windows la primera vez que arranca la versión nueva, y la migración 7 corre sobre la base real al abrirla. Las dos cosas son esperadas, pero el agente de verificación debe saberlo.

## Verificación ejecutada

- `cargo test -p np-sync`: 7 unitarios (crypto 3, peers 1, rows 3) + 1 `npsync` + 2 de protocolo (`tests/protocol.rs`), todos en verde.
- `cargo test -p np-store`: 28 pasan, 1 ignorado (`keyring` real, como antes).
- `cargo check -p np-app` (con `CARGO_TARGET_DIR=target/p07`): sin errores ni avisos.
- `pnpm --filter @newpaper/i18n test`: 18/18.
- `pnpm --filter @newpaper/ui typecheck`: sin errores.
- `pnpm --filter "./apps/ui" build`: correcto (aviso preexistente de tamaño de fragmento).
- `vitest run src/shell/registry src/ipc`: 4/4.
- `vitest run` completo: 68 de 71; los 3 fallos son tiempos de espera de 5 s en `features/privacy` (`PrivacySection`, `TorPopup`) con la máquina cargada por la compilación; en solitario `src/features/privacy` pasa 13/13.

## No verificado

- Tarea 11 (prueba manual entre dos equipos): no se ha hecho (requiere la app abierta, el móvil y Wireshark). No se ha ejecutado ningún e2e ni se ha tocado la app en ejecución.
- mDNS real en una LAN, Tailscale real, claves en el llavero de Windows, emparejamiento con código pegado entre dos escritorios.
- Disparadores de FTS de `history` tras una fusión (el `UPDATE` debería mantenerlo, no se ha comprobado con datos).
- Aspecto visual frente al mockup `Sincronizar.dc.html` en la app real (la verificación la hace un agente aparte).

## Textos añadidos (es/en/de)

`sync.e2e`, `sync.qrTitle`, `sync.qrHint`, `sync.fingerprintLabel`, `sync.pair.{idle,idleSub,searching,searchingSub}`, `sync.devicesCount`, `sync.devicesHint`, `sync.tailscale`, `sync.summary`, `sync.via.{lan,tailscale,manual}`, `sync.scopes.count`, `sync.scopes.{settings,history,saved,analyses,topics,sources,keys}Desc`, `sync.peer.revokeConfirm`, `sync.backup.{label,headline}`, `settings.devices.*`.
