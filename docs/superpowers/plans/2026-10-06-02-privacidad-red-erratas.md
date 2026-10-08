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

## Revisión contra los mockups reales (Main, Ajustes, Errores, Movil-Tor)

Sustituye a la limitación de la revisión anterior: ahora sí se compararon `Main.dc.html`, `Ajustes.dc.html`, `Errores.dc.html` (solo el estilo del aviso) y `Movil-Tor.dc.html` (matriz del mapa y lista de países). Los `.dc.html` no se renderizan tal cual (falta `support.js`), así que se comparó leyendo marcado, estilos inline y `renderVals`, y se montó una réplica estática del popup del mockup para contrastar el encuadre del mapa (mismos valores: `translate(-200px, 8.8px) scale(.505)` para ES→JP). Lo implementado se vio en un harness temporal con `__TAURI_INTERNALS__` simulado (temas papel/tinta, es). Estados cubiertos: escudo con contador, chip (Tor listo, directo, caído, "Sin Tor"), popup (listo con candidato, vuelo ES→destino, directo), diálogo "abrir sin Tor", Ajustes › Privacidad y red (Tor, mapa mundo/Europa, chips, ruta) y Ajustes › Bloqueo. Nada de esto está verificado en WebView2 real.

| Área | Desajuste | Corrección | Commit |
|---|---|---|---|
| Mapa (`DotMap`) | La revisión anterior dibujó una "rejilla de tierra simplificada" inventada con polígonos | Nuevo `worldMap.ts` con la matriz `R` real (72 × 28, celdas de 5°, lat 80 → −60) y la proyección `((lon+180)/5+.5)/72`, `((80−lat)/5+.5)/28`; `LandDots` la pinta en % del recuadro | e7e4cbf |
| Popup de Tor | Sin mapa propio: solo texto y un icono de avión dentro del botón | `RouteMap`: capa 1000 × 389 con zoom/centrado animado (1 s) entre origen y candidato, arco punteado `Q`, pin de salida relleno (14 px) y pin candidato con anillo (12 px) contraescalados, avión con `offset-path` a lo largo del arco (1,8 s) y etiqueta "Salida · XX" / "A → B" | e7e4cbf |
| Popup de Tor | Tarjeta de 340 px con padding y botones pill; selector de flechas con texto en cuadrícula; sin pager ni línea de estado | Tarjeta de 300 px (radio 18, sombra `0 20px 50px`, animación `menu`), mapa de 118 px, selector de flechas con animación de deslizamiento, pager de puntos (16 px el activo, tono claro el actual), botón de vuelo de 44 px (radio 12; "Ya sales por aquí" cuando el candidato es la salida actual), pie con punto pulsante + "Saliendo por {país}" y enlace "Más opciones" | e7e4cbf |
| Popup de Tor | Durante el vuelo el botón solo cambiaba de texto 0,9 s | Vuelo de 1,9 s mínimo (o hasta que responde el comando), "Construyendo un circuito nuevo…" en el pie; el avión no se pinta con `prefers-reduced-motion` | e7e4cbf |
| Chip de Tor | Píldora con borde de 44 px de alto | 28 px, radio 8, sin borde, fondo `--np-tor-soft`; relleno `--np-tor` al abrir; punto pulsante. El objetivo táctil sigue siendo de 44 px con `.np-hit` | e7e4cbf |
| Escudo | Icono de 18 px sin forma del mockup | Icono de 13 px con el trazado del mockup, contador mono de 12 px, 28 px de alto y radio 8 (44 px de objetivo con `.np-hit`); cifras del popover en Newsreader | e7e4cbf |
| Ajustes › Red | Modos como tres tarjetas con borde | Control segmentado sobre `--np-soft` (radio 12) con el modo Tor activo en `--np-tor` y textos cortos del mockup | e7e4cbf |
| Ajustes › Red | Mapa decorativo sin interacción ni zoom | `PinMap`: pines clicables (con ping y rótulo del país activo) y selector Mundo/Europa (zoom 3,4× en 51,5 % / 24 %) | e7e4cbf |
| Ajustes › Red | Lista de países en rejilla de botones; ruta como texto | Chips pill de 32 px (objetivo de 44 px con `.np-hit` y 12 px de separación vertical), tarjeta con cabecera, mapa, chips y fila de ruta con nodos "Tú ── Guardia ── Medio ── Salida · XX" (`TorRoute`) | e7e4cbf |
| Ajustes › Red | "Conexión directa…" como párrafo suelto; opciones de enrutado sin contenedor | Aviso `--np-warn-bg` (radio 14) y tarjeta blanca con filas separadas por `--np-line2` | e7e4cbf |
| Ajustes › Bloqueo | Interruptor maestro y listas sin tarjeta; sin contador | Tarjeta "Hoy" (Newsreader 34 px), tarjetas para el interruptor maestro y las listas (nombre 500 + meta de 13 px) | e7e4cbf |
| Diálogo sin Tor | Cuerpo como párrafo plano y botón "danger" rojo | Cuerpo en aviso ámbar (estilo de `Errores.dc.html`), título Newsreader 500 y botón de confirmación en `--np-warn` | e7e4cbf |
| Países de salida | Faltaban BR, JP, SG y AU del mockup; coordenadas de capitales | Añadidos BR, JP, SG, AU y coordenadas de centro de país tomadas del mockup (las de los países que ya existían se ajustaron) | e7e4cbf |
| i18n | Textos largos en los modos; sin textos para el estado del popup, el zoom ni la pista del mapa | Claves nuevas `privacy.tor.{flyHere,building,statusExit,statusExitAuto}` y `privacy.settings.{exitHint,zoom,zoomWorld,zoomEurope}` en es/en/de; descripciones de modo acortadas como en el mockup | e7e4cbf |
| Test | `TorPopup.test.tsx` esperaba 2 s a que el botón recuperase su texto; el vuelo dura ahora 1,9 s | Timeout del `findByRole` a 4 s (sin tocar las aserciones) | e7e4cbf |

### Desviaciones asumidas respecto a los mockups

- **Latencia y nº de relés por país** ("380 ms · 112 relés de salida", rótulo "Nombre · ms" en el pin, lista de 14 países con ms/relés): excluidos por la decisión 6 del plan (Arti no los expone). La tercera línea del selector solo dice "Salida actual" cuando procede.
- **"Datos ahorrados (MB)" y "Muros de cookies"** en Ajustes › Bloqueo: no se calculan en v1 (decisión 6). Solo se muestra la tarjeta "Hoy".
- **Guardia/Medio con país** ("Guardia · DE", "Medio · SE") y los países de guardia/medio: Arti no los expone; la ruta nombra solo la salida.
- **Ajustes de "Bloqueo si se cae Tor", "DNS a través de Tor" y "Bloquear WebRTC"** (interruptores en el mockup): en la implementación son invariantes de seguridad siempre activos (kill switch, DNS remoto, política WebRTC), no opciones; no se muestran como interruptores. Se mantienen "RSS por Tor" e "IA por Tor".
- **Escudo**: el mockup enlaza el contador directamente a Ajustes; se mantiene el popover con el interruptor de bloqueo y el enlace a Ajustes (spec §4).
- **Mockup móvil** (`Movil-Tor`): hoja inferior del plan 08, fuera del alcance; solo se usó la matriz del mapa y la lista de países.
- **Lista de países**: el mockup trae 14 (15 con RO en Ajustes); se conservan los 17 originales y se suman BR, JP, SG y AU (21 en total). Los pines de Europa se solapan en la vista "Mundo", igual que en el mockup; la vista "Europa" los separa.
- **Pines del mapa de Ajustes**: miden 32 px (como el mockup), no 44, pero son un atajo de puntero redundante (`aria-hidden`, `tabIndex=-1`); el control accesible son los chips (≥ 44 px de objetivo) y el selector de zoom usa `SegmentedControl` de 44 px.
- **Alturas**: botón de vuelo 44 px (mockup 42), "Nuevo circuito" 44 px (mockup 36), flechas del selector 44 × 48 (mockup 40 × 48): se respeta el mínimo de 44 px.
- **Títulos de sección** (Newsreader 34 px con subtítulo): el h2 de 22 px es el estilo común de `pages.css` (subproyecto 1) y no se cambia aquí.
- **Mockup `Errores` (página "Tor bloqueado")**: plan 06; solo se tomó el estilo del aviso ámbar.
- **No verificado**: animaciones en vivo (el navegador integrado congela las animaciones CSS en segundo plano; el avión y los zooms se comprobaron fijando el estado/tiempo), WebView2 real y `offset-path` fuera de Chromium.
