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

## Verificación visual y funcional

Pasada hecha sobre la app real (build `custom-protocol` en `src-tauri/target/verify`, WebView2 con depuración remota, capturas de la ventana nativa con `PrintWindow` y de la UI por CDP) y contra los mockups servidos con `design/mockups/serve.mjs`. Tamaños: 1920x1080, 1280x800 y 820, 1024x700, 800x600, 600x500 y 420x500, en papel y en tinta.

### Qué fallaba

| Zona | Problema | Causa | Corrección |
|---|---|---|---|
| Recorrido (tarjeta) | Semitransparente, pequeña y descolocada en mitad de la ventana, encima de la lista de noticias | `.np-tour-card` se centraba con `transform: translate(-50%, -50%)` y la clase `np-rise` anima `transform` con `fill-mode: both`: al terminar, `transform: none` borraba el centrado (la esquina superior izquierda quedaba en el centro). Además no medía su propio tamaño | Tarjeta rehecha: centrada con flex (sin transform) o anclada con `left/top` calculados tras medirla; elige debajo, encima o al lado del elemento y se recorta a la ventana; `max-height` con scroll interno |
| Recorrido (marcas) | Resaltado calculado una vez; la tarjeta se salía a los 600 px (el tamaño de ventana quedaba viejo al reabrir tras redimensionar) | El listener de `resize` solo existía mientras el recorrido estaba abierto | `useTargetRect` usa `ResizeObserver`, `resize`, scroll (captura) y un refresco corto por las animaciones de entrada; reintenta si el elemento aún no existe; el tamaño de la ventana se lee al colocar |
| Diálogos de sistema | La webview nativa se dibuja encima de la UI: primer arranque, recorrido y novedades no usaban `useUnderlay` | Plan sin pasada visual | `FirstRun`, `Tour` y `WhatsNew` llaman a `useUnderlay`. Además `underlay.tsx` reutiliza la captura si un diálogo reemplaza a otro (primer arranque y luego recorrido): antes la segunda captura se tomaba con la página ya oculta y salía en blanco |
| Primer arranque | Panel de 560 px con `max-height: 90vh` sobre un fondo alineado arriba con 120 px de relleno; sin sitio en alturas cortas | Reutilizaba el diálogo del análisis | Tarjeta `np-sys-card` (centrada con `margin: auto`, `max-height` de la ventana, cuerpo con scroll interno y pie fijo con Continuar), filas que se apilan en estrecho, `prefers-reduced-motion` |
| 404, errores, cuelgue, sin conexión, tres en raya | Texto plano; `np-surface` (absoluta) combinada con `np-neterr` (ancho máximo y margen auto); sin ilustraciones ni la maquetación del mockup | Estilos escritos sin abrir los mockups | Dos columnas con ilustración de línea (papel con cable cortado, círculos Tor, medalla, reloj, rodillos atascados), tipos móviles 4-0-4 con caída y volteo, columna de periódico con flechas y puntos, marcador del tres en raya; en alturas menores de 560 px se oculta la ilustración. El 404 por HTTP muestra además las acciones de `classifyFailure` (hemeroteca, volver) |
| Sin conexión | "Leer la edición del 21 de enero de 1970" | `createdAt` viene en segundos y se pasaba a `new Date` como milisegundos | `* 1000` (como ya hacía `EditionPage`) |
| Ajustes: Actualizaciones y Ayuda | Sin título ni descripción de sección; botones a todo el ancho; sin glifo ni resumen en la barra lateral (`np-wizard-actions` no existe en ningún CSS) | Secciones escritas sin compararlas con General | Mismo molde que General (`np-settings-h2`, tarjetas con filas `np-set-row`, `np-set-btn`), glifos y segunda línea (versión; descripción) |
| Ajustes en ventanas estrechas | Barra lateral fija de 260 px: a 600 px quedaban 340 px para la sección | Sin media queries | Por debajo de 760 px la barra pasa a una tira horizontal con scroll sobre la sección (que sigue desplazándose sola); la entrada activa se mantiene a la vista |

### Qué coincidía con el mockup (sin cambios)

Privacidad y red, Inteligencia artificial, Análisis, Fuentes, Bloqueo, General (Apariencia), Sin conexión y Datos e historial: sidebar de 260 px con panel propio, tarjetas, mapa, interruptores, anillo de foco de 2 px de acento en todo lo enfocable y barra lateral fija mientras la sección se desplaza. Ninguna sección desborda en horizontal de 1280 a 600 px. Tinta derivada de los tokens: correcta en todas. Sin errores ni avisos de consola recorriendo las 10 secciones, `ajustes/ia/conectar`, 404, sin conexión y el recorrido entero.

### Diferencias respecto a Ajustes.dc.html que no son del plan 06 (siguen abiertas)

- Falta el cuadro "Buscar ajuste" de la barra lateral.
- Análisis: el mockup tiene "Excepciones por medio" y los interruptores de reutilizar análisis, subrayar frases y avisar de discrepancias; la sección real solo tiene los tres modos y el detector (plan 05).
- "Apariencia" y "Datos" del mockup se llaman "General" y "Datos e historial" en la app (decisión de planes anteriores).

### Verificación funcional (con guardas)

Todo lo que tiene efecto real se neutralizó con un parche del `invoke` empaquetado (solo en el dist servido para la prueba, nunca en el repo) y estados falsos por `localStorage`: `first_run_apply`, `open_default_apps`, `ollama_pull`, `update_check`, `update_install_now`, `update_set_channel`, `content_check_now`, `content_revert`, `offline_fetch_html`, `update_ack_notes`, `plugin:autostart|*`, `bookmarks_scan` (falso) y los estados de `update_status`, `content_status`, `first_run_status` y `app_ready`.

| Qué | Resultado |
|---|---|
| Primer arranque (`first_run_status.done = false`) | Aparece centrado sobre la página nativa (captura de la webview) en todos los tamaños; con Ollama y navegadores, sin Ollama ni navegadores (botón "Conseguir Ollama"), importación falsa ("Importados 2 de 2 · 7 de otros sitios no se importan"), descarga falsa del modelo, interruptores de inicio y Tor; Continuar llama a `first_run_apply({autostart:false,tor:false})` (bloqueado y registrado) y arranca el recorrido |
| Recorrido, 11 pasos | Bienvenida, temas, IA, red, 6 marcas, final. Las marcas se probaron con elementos sintéticos con los selectores reales (`[data-tour]`, `.np-lens mark`, `.np-ring`) a 1280, 1024, 800 y 600 px: resaltado exacto sobre el elemento, tarjeta siempre dentro de la ventana y sin tapar el resaltado; redimensionar la ventana real con el recorrido abierto lo mantiene anclado. Tor y Ajustes son reales. Escape y Tab (trampa de foco) funcionan |
| 404 de página interna (`newpaper://zzz`) y por HTTP (servidor local) | Correctos; el segundo con acciones |
| Errores de red | Con servidor local: conexión rechazada (desconocido) y certificado inválido (medalla; sin "continuar"). Con estado falso en la UI: tiempo agotado, sin conexión, DNS, 500 |
| Cuelgue | Superficie probada emitiendo un `tabs://changed` con `crashed: true` (no se mató ningún proceso) |
| Sin conexión y tres en raya | Correctos |
| Actualizaciones | Estados `checking`, `upToDate`, `downloading`, `ready` (con notas y "Reiniciar y actualizar"), `torUnavailable`, `error` y contenido con historial; diálogos de novedades y de vuelta atrás, con notas largas, a 1280 y 600 px |

### Cosas vistas que no se han tocado

- La app lanza sola una comprobación de actualización y de contenido al arrancar y los errores se muestran tal cual, en inglés técnico ("Could not fetch a valid release JSON from the remote", "HTTP status client error (404 Not Found)..."): aún no hay releases publicadas. Conviene mapearlos a un mensaje localizado.
- Las pestañas de error y de 404 muestran "Sin título" en la tira de pestañas.
- No se ha provocado un cuelgue real del renderizador, ni un tiempo agotado real de 30 s, ni el estado `torBlocked` (la ilustración existe y se comprueba por código).
- No se ha ejecutado el e2e `tour.e2e.ts` (regla del proyecto).

### Estado de los ajustes reales

Al empezar: `device.firstRunDone = true`, `tour.done = true`, `appearance.theme = "paper"`, `privacy.mode = "tor"`, `ai.preset = "privacy"`. Durante la prueba `device.firstRunDone` se puso a `false` una vez para ver el primer arranque, y una pulsación de Continuar llegó al comando real antes de instalar la guarda (autostart y Tor desactivados, igual que el estado inicial; dejó `firstRunDone = true`). Los pasos "Solo en mi equipo" y "Usar Tor" del recorrido reescribieron `ai.preset = "privacy"` y `privacy.mode = "tor"` (mismos valores). Al terminar todos tienen el valor inicial. No se tocó el llavero ni se llamó a ningún proveedor de IA.
