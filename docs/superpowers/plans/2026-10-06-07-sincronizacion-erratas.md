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

## Revisión independiente: seguridad, funcionamiento y regresión visual

Revisión hecha por un segundo agente sobre los commits 45c6523..bb8a5f9, con la app real compilada (`target/verify`) y un segundo par en proceso (arnés temporal sobre `np-sync`, no se commitea) que emparejó y sincronizó por TCP real en loopback. No se emparejó con ningún dispositivo real y la escucha quedó apagada al terminar. Commits: 10b5061 (seguridad), d564fa1 (UI y textos) y 5ed5ccc (bloqueo, límites y visual).

### Hallazgos de seguridad, por gravedad

| # | Gravedad | Hallazgo | Corrección |
|---|---|---|---|
| 1 | Crítica | El ámbito `settings` sincronizaba **todos** los ajustes salvo `device.*`: un par (o un `.npsync` ajeno) podía poner `privacy.mode=direct`, `privacy.*ViaTor=false`, `ai.customEndpoints` (redirigir las claves de API a un servidor suyo; se aplicaba al reiniciar), `adblock.settings`, `history.*`… | Lista blanca de claves (`general.locale`, `content.locale`, `appearance.theme`, `appearance.pageTransition`, `reader.autoOpen`, `reader.sizeStep`) con comprobación de tipo y valor por clave, aplicada al enviar, al recibir y al exportar. Todo lo demás es local. El texto de la tarjeta decía "red y pipeline": corregido |
| 2 | Alta | Reloj HLC envenenable: el HLC remoto se observaba antes de validar la fila y sin tope, y se comparaba como texto, así que un `updated_at` futuro o no canónico (`"9-1-x"`) ganaba para siempre y adelantaba el reloj local | HLC canónico (`to_string()` idéntico), nodo alfanumérico, no más de 24 h en el futuro; las filas inválidas no mueven el reloj |
| 3 | Alta | Reescritura por `id`: el `UPDATE` aplicaba todas las columnas, así que una fila con el `id` de un ajuste permitido y otra `key` cambiaba la clave natural; también URLs `javascript:`/`file:` en `url`, `article_url` y `feeds_json` | `id` derivado de la clave natural (`stable_id`) obligatorio en ajustes, guardados, medios propios, temas, ajustes de medio y análisis; URLs solo http(s); JSON válido en `article_json`/`json`/`feeds_json`; tamaños; una fila inválida se descarta sin abortar el resto |
| 4 | Alta | Se aceptaban tramas de 16 MiB y se reservaba el búfer entero **antes de autenticar**; sin plazo de lectura ni límite de conexiones (un solo equipo ocupaba el servidor); el bucle de `accept` terminaba en silencio ante un error | Saludo ≤ 4 KiB y 5 s; primer mensaje cifrado ≤ 64 KiB y 10 s; lectura por trozos (no se reserva lo prometido); 60 s entre mensajes; máximo 8 sesiones y 2 por IP de origen; solo orígenes de LAN, Tailscale o bucle local; `JoinSet` (al apagar la escucha se abortan las sesiones); un error de `accept` no mata la escucha. Límites por sesión: 5 000 filas por trama, 2 000 tramas, 64 claves de ≤ 8 KiB |
| 5 | Alta | Cualquier conexión con `Hello::Pair` **consumía la oferta** (DoS del QR por un desconocido en la LAN) y dos conexiones simultáneas podían ganar la misma oferta | `begin`/`fail`/`complete`: la oferta sobrevive a desconocidos (se invalida tras 5 intentos fallidos o a los 2 min) y se consume una sola vez aunque haya carreras. Secreto de 128 bits |
| 6 | Alta | `sync_status` **bloqueaba la app**: `status()` tomaba dos veces el mismo `Mutex` dentro de una expresión (los temporales viven hasta el final de la sentencia), así que la primera consulta de la UI se quedaba colgada. Solo se vio al ejecutar la app | Un solo bloqueo |
| 7 | Media | Sin contador en el canal: una trama repetida, reordenada o descartada por quien está en medio del camino se aceptaba | El número de orden de cada mensaje es dato asociado del AEAD (`seal_aad`/`open_aad`) |
| 8 | Media | Transcripción sin las claves estáticas; puntos de orden pequeño (`0…0`) aceptados en X25519 | La sal HKDF liga las dos claves estáticas y las dos efímeras (ordenadas por clave pública); se rechaza todo DH no contributivo; `SessionKeys` y el material derivado se borran de memoria (`zeroize`) |
| 9 | Media | `{other:?}` de un `Msg` en errores: podía volcar claves de API o filas al registro y a la UI | `Debug` de `Msg` solo imprime el tipo |
| 10 | Media | Las direcciones del QR/código y las manuales llegaban a `TcpStream::connect(&str)`: un código malicioso provocaba **resolución DNS** (fuga fuera de la red local) | Solo literales `ip:puerto`; las del código, además, solo redes privadas, CGNAT (Tailscale) o bucle local; máximo 8 |
| 11 | Media | Revocar solo marcaba el par: conservaba su clave pública, ámbitos y permiso de claves, y una sesión en curso seguía aplicando datos | Revocar borra clave pública, direcciones, ámbitos, permiso de claves y registro; la sesión en curso se corta en el siguiente mensaje. Ver "Revocar: decisión" |
| 12 | Media | `.npsync` ajeno: parámetros de Argon2 hasta 1 GiB × 10 pasos × 8 carriles, cabecera sin autenticar, fichero sin tope, versión sin comprobar | Tope 256 MiB / 6 pasos / 4 carriles (los propios son 64 MiB / 3 / 1, sobre el mínimo de OWASP), cabecera como dato asociado, fichero ≤ 256 MiB, `v == 1`, clave y texto en claro borrados; la frase de paso se borra de memoria |
| 13 | Baja | `sync_pair_start` activaba la sincronización de forma persistente sin que la persona la hubiera encendido | Exige sincronización activada (el botón se desactiva con un aviso); apagarla cancela la oferta; si no se puede abrir el puerto, el ajuste vuelve a "apagado" |
| 14 | Baja | mDNS anunciaba nombre del equipo y huella | Solo `id` aleatorio (nombre de instancia), puerto y `v=1`; comprobado capturando el tráfico. Quedan visibles el id y la IP: un observador de la LAN que conozca el id de otro par puede preguntar si está emparejado (el id es un UUID v4) |
| 15 | Baja | ID y nombre del par se aceptaban sin validar | `valid_device_id` (8–64, alfanumérico y `-`), `clean_name` (sin control, ≤ 40); no se empareja con uno mismo |
| 16 | Baja | Los ajustes recibidos o importados no avisaban a los observadores (tema, lectura) | `Store::notify_setting_changed`; verificado en la app: el tema cambió en vivo tras sincronizar |

Revisado y correcto: x25519-dalek 2 + HKDF-SHA256 con etiquetas distintas por sentido (`a->b`, `b->a`, `np-pair-v1 …`), XChaCha20-Poly1305 con nonce aleatorio de 192 bits (sin riesgo de repetición), emparejamiento por secreto de QR como sal (el servidor se autentica descifrando y el cliente comprueba id y clave contra el QR), `sync.identity` y las claves de API nunca llegan a JS (la UI solo ve `PeerView`: clave pública y huella), las claves solo viajan con doble opt-in, nombres de columna y tabla de SQL salen de listas cerradas (`PRAGMA table_info`), disparadores de FTS intactos tras la fusión (probado con búsqueda en la app y en tests). Capacidades: solo la webview `ui`, 12 `allow-sync-*` (todos los usa la UI) y `dialog:allow-open`/`allow-save` (no `dialog:default`).

Tests de regresión añadidos: `rows::security_tests` (lista blanca de ajustes, ids derivados, HLC, URLs, tamaños, FTS tras fusión), `npsync::security_tests` (parámetros hostiles, cabecera autenticada, fichero con ajustes locales), `crypto` (puntos de orden pequeño, dato asociado), `pairing` (oferta, caducidad, direcciones), `identity` y, en `tests/protocol.rs`, desconocido que no quema la oferta, autoemparejamiento, tramas malformadas y de ruido, repetición y reordenación de tramas, `Debug` sin secretos, revocación y una sesión real por TCP en loopback.

### Revocar: decisión

El mockup decía "se borrará su clave de este PC". Lo único por par que guarda este equipo es la **clave pública** del otro (los secretos de sesión son efímeros y no se guardan; la identidad propia es una sola). Se decide que revocar la **destruye** (junto con direcciones, ámbitos y registro), deja la fila solo como constancia ("Nombre · Revocado") y exige un QR nuevo para volver; el texto de la UI vuelve a ser cierto. Lo que no se puede deshacer: las claves de API que ya se enviaron a ese par. Si el par tenía el permiso de claves, la confirmación lo dice ("cámbialas en tu proveedor").

### Decisión que se mantiene y se muestra: TCP directo, no Tor

Se mantiene el plan: la sincronización va por TCP directo (LAN o Tailscale) y no pasa por Tor ni por el interruptor de seguridad. La UI lo dice en la tarjeta del equipo ("Nunca pasa por Tor, ni por servidores de terceros…"). Está **apagada por defecto**: sin el ajuste `device.sync.enabled` no se abre el puerto 47100 ni se anuncia mDNS (comprobado: tras el primer arranque no había nada escuchando; al encender el interruptor aparece `0.0.0.0:47100` y al apagarlo desaparece). Windows puede pedir permiso de cortafuegos la primera vez.

### Funcionamiento en la app real

Comprobado con la app compilada y un par en loopback: entrada de Ajustes y resumen (ahora se actualiza al emparejar o revocar), interruptor, edición del nombre (se aplica sin reiniciar), QR con cuenta atrás de 2 minutos, emparejamiento por QR (el par aparece al instante) y por código pegado con sincronización automática, ámbitos por dispositivo, aviso de claves, direcciones (se descartan los nombres y se conservan las IP), "Sincronizar ahora" con error legible, revocar con confirmación, exportar `.npsync` (rechaza menos de 8 caracteres), importar con frase errónea, con fichero basura, con fichero inexistente y con la frase correcta, búsqueda en el historial tras sincronizar (FTS), filas hostiles de un par autenticado (rechazadas: `privacy.mode` y `ai.customEndpoints` quedaron igual), e inundación de 12 conexiones y ruido aleatorio contra el puerto real (10 de 12 cortadas al instante, la app sigue respondiendo).

Arreglado además: faltaba el encabezado de sección (título y descripción como el resto de Ajustes); el error "no address" se mostraba en crudo; un emparejamiento aparecía como "última sincronización".

### Visual frente a `Sincronizar.dc.html`

Coincide: dos columnas (2:3), tarjetas de radio 22 px, etiquetas en mayúsculas con tracking, franja inferior "Sin red / Pasa los datos con un archivo" a ancho completo, huella en grupos, interruptores y avisos con los tokens del tema. Papel y tinta revisados a 1920×1080 (ventana real), 1440, 1280, 1024, 800 y 600 px: sin desbordamiento horizontal, barra lateral fija mientras la sección se desplaza (≥ 800 px; por debajo pasa a la barra de chips de Ajustes, como el resto de secciones), anillos de foco visibles con teclado, sin animaciones con `prefers-reduced-motion`, sin errores de consola. A 1024 px las dos columnas quedaban de 380 y 269 px; ahora hay una sola columna por debajo de 1100 px. No hay superposiciones sobre la webview nativa en esta sección (la confirmación de revocar es en línea), así que no hace falta `useUnderlay`.

Diferencias que se mantienen: el QR solo se dibuja con una oferta activa y no lleva la insignia "np", los ámbitos van por dispositivo, no hay medidor de frase de paso, la primera tarjeta de la columna izquierda es "Este dispositivo" (nombre e interruptor) y no el QR, y el ancho de la sección lo fija el diseño de Ajustes (860 px).

### Pendiente o no verificado

- Dos equipos reales (móvil, mDNS en una LAN, Tailscale, Wireshark) y el paso de claves por el llavero entre equipos: no verificado (cubierto con tests de protocolo y el arnés en loopback). Tampoco el aviso del cortafuegos de Windows.
- Eco: las filas recibidas de un par vuelven a enviársele en la sesión siguiente (el diario no recuerda el origen); se ignoran por LWW pero duplican el tráfico del primer sync. No se ha cambiado.
- La sesión no guarda progreso hasta el `Ack` final: un historial enorme que supere los 120 s se reenvía desde cero.
- Cuando la app es quien escucha, el otro equipo inicia las sincronizaciones (no se conoce su dirección): "Sincronizar ahora" sin dirección da un error legible; hay que añadir la dirección a mano o usar el descubrimiento mDNS.
- `ai.connected` no se sincroniza (es un ajuste de IA): con el permiso de claves llegan las claves, pero el otro equipo debe conectar el proveedor él mismo.
- El historial va activado por defecto para un par nuevo (como en el mockup) y el primer sync al pegar un código es inmediato; el ámbito se puede quitar después, pero ya se habrá enviado.
- Incidencia durante la verificación: tras parar la app por PID y trabajar sobre `newpaper.sqlite` con herramientas externas (`node:sqlite` y un ejemplo de Rust), el fichero apareció sustituido por una base antigua e incompleta (800 páginas, contador 4). Se restauró desde la copia hecha antes del primer arranque (íntegra según `integrity_check`) y no se volvió a tocar la base con herramientas externas. La causa no se ha podido reproducir en una copia; hasta entenderla, no abrir la base real con herramientas externas.
