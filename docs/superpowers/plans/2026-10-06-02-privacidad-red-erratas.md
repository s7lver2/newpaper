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

## Fidelidad a mockups sobre la app real

**Qué falló en las revisiones anteriores.** Las dos revisiones previas (la de "tokens y spec" y la de "mockups reales") no comparaban imágenes: se hicieron leyendo el marcado de los `.dc.html` y probando en un harness con `__TAURI_INTERNALS__` simulado, nunca contra WebView2. Se retocaron el chip y el popup de Tor y se dio por buena la barra superior, que no se había revisado: pestañas de 52 px con botones de 44 px, barra de herramientas de 52 px, escudo y chip de Tor fuera de la píldora de dirección, sin candado ni host atenuado. Tampoco se detectaron fallos que solo se ven al medir en el motor real: los `button` heredaban Arial 13,33 px porque faltaba `font: inherit` (los mockups lo ponen global), Newsreader estaba instalada en peso estático, sin eje de tamaño óptico y sin peso 500 (los titulares salían con otra forma y otro peso), y los interruptores eran azules de 44 × 26 en lugar de los verdes de 46 × 28.

**Método de esta revisión.** WebView2 con `--remote-debugging-port` para capturar la UI real a 1440 × 900 y 1296 × 860 (temas papel y tinta, español y alemán) y medir con `getBoundingClientRect`/`getComputedStyle`; Chrome sin cabeza con el servidor de mockups (5601) para capturar y medir los mismos elementos de `Main`, `Ajustes` y `Errores`; comparación de recortes a 2x elemento por elemento.

| Área | Diferencia medida | Corrección | Commit |
|---|---|---|---|
| Barra de pestañas | 52 px de alto, pestañas de 36 px con `min-width` 120, "×" siempre visible, "+" de 44 px lejos de las pestañas. Mockup: 43 px (padding 8 12 0), pestañas de 35 px (9/17/9), gap 2, radio 10 10 0 0, 13 px, "+" de 32 px y 20 px pegado a la última pestaña | `.np-tabstrip*` con las medidas del mockup; punto de 8 px; cierre de 20 px visible en hover/activa (objetivo de 44 px con `np-hit`); etiqueta "Privada" con el estilo de la insignia | dec7ab0 |
| Barra de herramientas | 52 px, botones de 44 px, píldora de 38 px sin candado ni host atenuado, escudo y chip de Tor fuera de la píldora; sin botón de Ajustes. Mockup: 57 px (8 + 40 + 8 + borde), botones de 36 px radio 8 con icono de 18 px, píldora de 40 px, radio 12, padding 0 6 0 12, gap 10, escudo y chip dentro | `Toolbar`/`AddressBar`: elementos `slot: 'address'` dentro de la píldora; candado verde (`https` sin fallo), host atenuado + ruta en tinta, anillo de foco `0 0 0 4px`; botón de Ajustes (abre `newpaper://ajustes` en pestaña nueva) | dec7ab0 |
| Botones (global) | `button` con Arial 13,33 px | `:where(.np-root) :where(button, input, select, textarea) { font: inherit }` (especificidad 0) | 551eec4 |
| Tipografía serif | Newsreader estática 400/600: sin 500 ni tamaño óptico | `@fontsource-variable/newsreader` (opsz + peso); `--np-font-read` con `'Newsreader Variable'` de respaldo | 551eec4 |
| Interruptores | 44 × 26, azules | 46 × 28, verde `--np-ok`, bola de 22 px con sombra, token `--np-switch-off` | 551eec4 |
| Popup de Tor | Tercera línea del candidato ausente (63 → 49 px), flechas de 44 px, botón de vuelo de 44 px con borde, pie de 44 px con enlace de 12 px, rótulo del mapa de 19 px, popup a 8 px del chip, ruta partida en dos líneas | Línea reservada, flechas de 40 px (objetivo de 44 px con `::after`), botón de 42 px, pie 10/15/10 con texto de 11 px, rótulo de 17 px, `top: 40px` (12 px bajo el chip), ruta compacta en una línea; texto del botón "Volar a {país}" / "Volando a {país}…" como en el mockup | 295e000 |
| Escudo (popover) | Posición a 8 px | Mismo `top: 40px` que el popup | 295e000 |
| Ajustes: marco | Título "Ajustes" de 34 px sobre dos columnas sin separador, entradas de texto plano | Barra lateral de 260 px con borde, título Newsreader 28/500, entradas de 58 px con ficha de 30 px (glyph), subtítulo vivo (modo y país, bloqueos de hoy, tema) y entrada activa en tinta con sombra | 5ee1a9d |
| Ajustes: cabecera de sección | h2 de 22 px / 600 | 34 px / 500 Newsreader con entradilla de 14 px | 5ee1a9d |
| Ajustes › Red | Control Mundo/Europa de 44 px en píldora, chips con 12 px de separación vertical, "Nuevo circuito" de 44 px, fila de estado separada de los modos, encabezado "Qué pasa por Tor" visible | Segmentado de 32 px radio 8 (contenedor radio 10, padding 3), chips con gap 6 (objetivo de 44 px con `::after`), botón de 36 px radio 10, el estado se pega a los modos, encabezado solo para lectores de pantalla | 295e000 |
| Ajustes › Bloqueo | Tarjeta "Hoy" de 240 × 95, filas de lista de 82 px con la meta separada, encabezado de lista visible, sin entradilla | Tarjeta de 1/3 de ancho y 85 px (Newsreader 34 px con línea de 34), filas de 64 px (nombre 500 + meta de 13 px dentro del interruptor), entradilla "Anuncios, rastreadores…" | 295e000 |
| Ajustes › General | Tema como control segmentado de ancho completo | Tarjetas de vista previa (papel, tinta, sistema) de 84 px como en "Apariencia"; el segmentado de idioma ya no se estira | 5ee1a9d |
| Inicio | Título 40 px / 600 y pista como texto de ajustes | 52 px / 400 con tracking -0,025 em y subtítulo en cursiva de 20 px; columna de 640 px con 110 px de margen superior | 5ee1a9d |
| Errores y crash (`FallbackSurfaces`) | Título suelto y botón pill | Maquetación de `Errores.dc.html`: dibujo de línea animado de 260 × 220, antetítulo, título Newsreader 42/500, lead de 19 px, botón de 46 px radio 12 | dec7ab0 |
| Diálogo "abrir sin Tor" | Botones pill de 44 px | 46 px radio 12 (peso 500), como el botón de los mockups | (commit de documentación de esta revisión) |

### Desviaciones asumidas (revisión sobre la app real)

- **Barra superior sin "Análisis"**: el botón "Análisis" y el panel lateral pertenecen al plan 05 y no se pintan. El botón de recarga no existe en el mockup pero se mantiene (mismo estilo de 36 px). El botón de Ajustes sí se añade (solo abre la página de ajustes, sin IPC nuevo).
- **Puntuación en las pestañas** (insignia "44") y **color de sesgo** del punto: datos del plan 05; el punto es neutro y se vuelve azul pulsante al cargar.
- **Ajustes**: no se pinta el buscador "Buscar ajuste", las entradas "Inteligencia artificial", "Análisis" y "Fuentes" (planes 03-05) ni el pie "newpaper 0.1 · Tauri 2". "Apariencia" y "Datos" del mockup son pantallas de otro contenido (tamaño de lectura, caché de análisis, índice RSS): las secciones "General" y "Datos e historial" conservan su contenido y solo heredan marco, tipografía y tarjetas de tema.
- **Barra "Volver" y URL de mockup** de `Ajustes`/`Errores`: andamiaje del prototipo (la app real ya tiene la barra superior); no se reproducen. Tampoco el selector de variantes de `Errores` (Tor bloqueado, certificado, tiempo agotado): plan 06.
- **Popup de Tor**: se mantienen la pista "Fijar un país reduce el anonimato", la ruta compacta, "Circuito n.º N", "Nuevo circuito" y "Abrir esta pestaña sin Tor" (requisitos del spec que el mockup no dibuja); el popup mide unos 440 px en lugar de 308 px por ese bloque inferior. El carrusel tiene 22 posiciones (Automático + 21 países) en vez de 14. Siguen excluidos latencia y nº de relés (decisión 6).
- **Fila final del interruptor**: el mockup dibuja un borde bajo la última fila de la tarjeta; la app no.
- **Título de las pestañas internas**: las páginas `newpaper://` muestran "Sin título" (el título lo fija el núcleo en Rust; no se toca el comportamiento).
- **No comparado**: animaciones (avión, zooms, trazo del dibujo de error), solo verificadas en su estado final; estados hover/active, solo por CSS; el artículo en modo lector y el panel de análisis (planes 03-05); `Crash` y `Error404` no existen entre los mockups entregados.
