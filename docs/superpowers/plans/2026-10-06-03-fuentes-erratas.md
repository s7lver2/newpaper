# Erratas del plan 03 (fuentes)

Registro de errores encontrados al ejecutar el plan y cómo se corrigieron. Las correcciones ya están aplicadas en el código; el texto del plan no se ha reescrito.

| Tarea | Error | Corrección | Commit |
|---|---|---|---|
| 10 | `RequestBuilder::query` no existe con las features de `reqwest` del workspace (E0599) | Feature `query` añadida a `reqwest` en `np-feeds/Cargo.toml` | 6d124ba |
| 10 | El plan dice “el test de Exa lo comprueba” en la nota de la marca temporal, pero no define ese test | No se añade test: la búsqueda de respaldo no es una pieza de núcleo según la política de tests; la nota queda como comentario | 6d124ba |
| 13 | `split_turns`: la condición de acotaciones tenía un paréntesis sin cerrar (“mismatched closing delimiter”) | Paréntesis corregido | 9a769ff |
| 14 | El paso 5 (construir el léxico español real) descarga el Diario de Sesiones y la lista de diputados desde la red | No ejecutado (regla del usuario: sin corpus ni red). `config/lexicon-{es,en,de}.json` quedan en `pending` con `phrases: []`; en `en`/`de` `legislature` va vacío y `source` lleva el nombre del parlamento | adbf353 |
| 16 | `ParagraphDiff.kind` se declaró `Option<EditKind>`, pero `diff_texts` y el test lo tratan como `EditKind` (E0308) | Campo `kind: EditKind` | 1a9f9a2 |
| 18 | `sources/mod.rs` y `sources/commands.rs` usan `rusqlite` sin tenerlo declarado en `np-app` (E0433) | `rusqlite = { workspace = true }` en `src-tauri/Cargo.toml` | ebed173 |
| 20 | El test `builds_an_edition_and_lists_it` espera `bytes == 2048`, pero `add_article` suma también el tamaño del JSON del artículo (18 bytes) | Aserción `2048 + len(article_json)`; la contabilidad de bytes queda documentada en el código | fdce576 |
| 22–23 | El plan sustituye `rewriteImage` por una versión de un solo argumento; se pierde el parámetro `pageUrl` que añade `?r=` (Referer) en el lector existente | Se conserva la firma existente y solo se añade el paso directo de `http://npoffline.localhost/` | d9c41cc |
| 25 | El paso 5 (comprobación de feeds contra la red) y el paso 6 (prueba E2E con datos reales) no se ejecutan por la regla del usuario | Pendiente: `node scripts/check-feeds.mjs config/sources-{es,en,de}.json` cuando haya red; las URL de feed no están verificadas | 9a68d40 |
| 25 | `config/sources-es.json` ya existía como semilla del subproyecto 1 | Sustituida por la del plan (34 medios, mismo formato) | 9a68d40 |

## Revisión visual y funcional sobre la app real

**Método.** App real en WebView2 (`--remote-debugging-port` + CDP) con la base de la app (copia de seguridad restaurada al terminar) sembrada con medidas de línea editorial de 24 medios (`outlet_stats`), la edición del día generada con red real (10 artículos) y un artículo guardado; capturas a 1440 × 900 y 1296 × 860 en papel, tinta y alemán, y mediciones con `getBoundingClientRect` frente a `Ajustes.dc.html` (sección Fuentes) y `EdicionOffline.dc.html`. Las cabeceras de tarjeta, el eje, las filas de evidencia, el detalle (740 px de alto en el mockup), la cabecera de la edición (128 px) y el panel lateral (380 px) coinciden al píxel; lo demás depende del contenido real.

| Área | Diferencia / fallo | Corrección | Commit |
|---|---|---|---|
| Fuentes | Lista plana de 58 medios (todos los idiomas) con un `<input>` numérico por fila y un eje SVG sin etiquetas | Tarjeta de eje con una píldora por medio en carriles sin solapes (6/40 · línea 75 · 88/122, 150 px; hasta 8 carriles si hacen falta), borde rojo/gris/azul, discontinuo si está desactivado, línea de balance; solo los medios del idioma de contenidos; los no medidos, aparte | a5de61b |
| Fuentes › detalle | No existía | Tarjeta de detalle como el mockup: nombre 28 px, estimación ± banda, interruptor «Usar para contrastar», eje con banda y marca de corrección (transición de 1 s), «Cómo lo sabemos» con pesos reales, encuadre por tema, fiabilidad, corrección con deslizador (se guarda al soltar) y «Restablecer»; entrada `rise` al cambiar de medio | a5de61b |
| Fuentes › activar/desactivar | Sin efecto en el backend | `FeedsSettings.disabled_outlets` (ajuste `feeds.settings`): esos medios no se usan al elegir coberturas; el detalle de un hecho sigue mostrándolos todos | 3019190 |
| Fuentes propias | Quitar una fuente propia la dejaba para siempre en la tabla `outlets` y en la lista | `sync_sources` borra los `custom-*` que ya no están (los artículos se quedan sin medio); test `removes_custom_outlets_that_are_no_longer_wanted` | 3019190 |
| Fuentes › búsqueda de respaldo | Segmentado + fila de clave sin tarjeta | Tarjeta de filas como el mockup (selector de 40 px, clave, «Actualizar RSS cada» con «Actualizar ahora») | a5de61b |
| Barra de ajustes | «Fuentes» y «Sin conexión» sin icono ni subtítulo | Glifos ☰ y ◔ y subtítulos vivos («34 medios», «Edición a las 07:00») | a5de61b |
| Sin conexión | Campos numéricos sueltos | Interruptores con descripción, hora, chips de temas seguidos, deslizador de artículos con estimación en MB, barra de espacio con leyenda, límite (250/500/1000) y caducidad (3/7/14) segmentados, aviso de borrado | a5de61b |
| Edición del día | Lista de botones sin maquetación | Portada: cabecera con filete doble y estado de red, «Lo esencial», rejilla de tarjetas (la primera a todo el ancho, chip «analizado», elevación al pasar el ratón), lector con aviso de análisis en caché y panel lateral «Leer más tarde» con búsqueda local sin duplicados | a5de61b |
| **Imágenes de la edición** | Todas las imágenes se descartaban: `fetch()` a `npimg` lo bloquea la CSP (`connect-src`), `compressImage` devolvía `null` y el constructor las quitaba | Carga con `<img crossOrigin>` + canvas; `npimg` responde `Access-Control-Allow-Origin: *` (solo a la webview `ui`) | daf15d9 |
| **Nombres de imagen** | `0.webp`, `1.webp`… se repetían entre artículos de la misma edición y se pisaban | `<índice-del-artículo>-<n>.webp` | daf15d9 |
| Guardar para más tarde | El artículo guardado conservaba URL remotas de imagen: sin red salían rotas | Se comprimen y guardan en local (carpeta `saved`) antes de guardar; botón ocupado mientras tanto | daf15d9 |
| Shell | Dos pestañas internas del mismo tipo compartían instancia (estado y scroll de la anterior, p. ej. un lector abierto en otra pestaña de Edición); datos de Fuentes obsoletos | `key={tab.id}` en la superficie interna | 4bb493f |
| Shell | Pestañas internas con «Sin título» | Título por página («Ajustes», «La edición del día», «Nueva pestaña») | 4bb493f |

**Comprobado en la app (datos reales + sembrados):** abrir Fuentes y seleccionar medios; corregir la línea de El País (71) y ver mover la píldora, la marca y el balance; quitar la corrección; activar/desactivar un medio (persiste en `feeds.settings`); añadir y quitar una fuente propia; «Actualizar ahora» (11 artículos nuevos, 14 feeds fallan); guardar y quitar un artículo desde la barra; generar la edición (botón y programador: con `time` pasada y `lastBuilt` de ayer se lanza sola y actualiza `lastBuilt`); abrir artículos de la edición y guardados con imágenes `npoffline`; búsqueda local. Sin errores en consola salvo el 404 de `favicon.ico` del servidor de desarrollo.

### Desviaciones asumidas (revisión sobre la app real)

- **Pantallas de planes 04–05 no construidas aquí:** Inicio (briefing, temas seguidos, «continuar»), Hemeroteca, Síntesis y SinCobertura siguen sin UI; el plan 03 solo publica los comandos (`events_briefing`, `coverage_for`, `wayback_*`). Inicio sigue siendo el provisional.
- **Mockup de la edición:** no hay «Preguntar al agente» ni «En cola hasta que haya red» (agente y cola son de los planes 04/07), ni pestaña «Ajustes de la edición» en el panel (los ajustes viven en Ajustes › Sin conexión, con un enlace desde el panel); el kicker de las tarjetas es el medio (los artículos descargados no guardan el tema); «descargada por Wi-Fi» no se muestra (no se registra el tipo de red).
- **Evidencia de la línea editorial:** con `outlet-priors.json` vacío de datos con fuente, «Quién lo lee» y «Referencias externas» salen con peso 0 % y «—»; no se inventan valores.
- **Barra de espacio:** solo dos segmentos (ediciones y guardados); el mockup añade «Análisis en caché», que no se contabiliza por separado.
- **Fuentes primarias** (INE, BOE, Maldita…) del mockup: pertenecen a la verificación (plan 04); no hay fila.
- **Objetivos de 44 px:** píldoras, chips, segmentados, botones, deslizadores y enlaces los cumplen con área ampliada; el selector de proveedor y la hora siguen en 40 px como en el mockup (no admiten pseudo-elementos).
- Los carriles del eje son automáticos (el mockup los asigna a mano); con muchos medios en un mismo punto se pasa a 6 u 8 carriles.
- Las imágenes de artículos guardados que se quitan de «leer más tarde» no se borran del disco (carpeta `saved`).

### No verificado

- Léxico real y priors con fuente (siguen vacíos); la línea editorial se probó con medidas sembradas.
- Feeds contra la red: `node scripts/check-feeds.mjs config/sources-es.json` da 12 de 34 fallidos. Servimedia se corrigió; siguen mal `publico` (404), `ondacero` (404), `vozpopuli` (404/403), `lasexta` y `antena3` (no son feeds), `larazon` (503), `cadenaser`, `ctxt`, `eleconomista`, `efe` (403) y `elperiodico` (406); algunos son bloqueos a clientes sin navegador y requieren buscar la URL vigente de cada medio. No se probaron `en`/`de`.
- Análisis rápido de la edición: no hay analizador registrado (plan 04); el aviso «Análisis en caché» y la «neutralidad» se vieron con datos sembrados.
- Movimiento reducido y WebView2 con Tor real (se usó `NP_FAKE_TOR=1`).
