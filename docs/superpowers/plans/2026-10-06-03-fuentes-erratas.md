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

## Léxico y medios en español (datos reales)

Ejecutado el 10-10-2026 con red, solo para `es` (`en`/`de` intactos).

### Léxico `config/lexicon-es.json` (legislatura XV)

- **Datos:** 206 diarios de sesiones del Pleno (`DSCD-15-PL-1…210`, fuera del repo; faltan 23, 41, 137 y 163, que devuelven 404 en el Congreso) y la lista de diputados de datos abiertos (`DiputadosActivos` + `DiputadosDeBaja`, 412 diputados). Descarga con `scripts/fetch-congreso-ds.ps1` (una petición cada 2 s, sin paralelismo, User-Agent descriptivo con contacto, reanudable). El script ahora también baja y convierte la lista de diputados a `diputados.json`, usa `pdftotext -enc UTF-8` y se detiene tras 3 números seguidos inexistentes (fin de legislatura).
- **Resultado:** 11.713 intervenciones, 1.500 frases (531 hacia la izquierda, 969 hacia la derecha), `status: "ready"`, 233 KB (no hace falta recortar). Bloques: izquierda = Bildu, Sumar, ERC, PSOE; derecha = PP, Vox (Junts, PNV y Mixto excluidos, como en `parties-es.json`).
- **Mejoras al importador** (el texto real del Diario no era el del plan): (1) los turnos del Gobierno se escriben «El señor MINISTRO DEL INTERIOR (Grande-Marlaska Gómez):», con los apellidos entre paréntesis, y a menudo el encabezado se parte en dos líneas; sin tratarlos se perdía casi todo el Gobierno (PSOE pasaba de 2,1 M a 0,9 M de palabras); (2) se quitan las acotaciones entre paréntesis dentro del texto («Aplausos … puestos en pie»); (3) se descartan los turnos en catalán, euskera o gallego (más del 2,5 % de marcadores).
- **Filtro de ruido estructural** (nuevo módulo `noise.rs`, solo en `np-lexicon build --deputies`): sin él, las frases más «de izquierda» eran «moltes gràcies» o «eskerrik asko» y las de derecha «señora ministra», «puestos en pie» o «señor Sánchez» (rol gobierno/oposición y no ideología). Se descartan las frases con fórmulas de tratamiento o procedimiento, saludos en lenguas cooficiales y nombres/apellidos de diputados que se escriben ≥ 90 % con mayúscula (399 tokens). Se piden 4× frases y se recorta a 1.500 tras filtrar.
- **Tests:** `cargo test -p np-lexicon` en verde (7 unitarios + 2 + 2); añadidos uno para encabezados de Gobierno partidos y dos de `noise.rs`.
- **Comprobación con textos de muestra:** párrafo de izquierda → 24,6; párrafo de derecha → 82,8 (ambos con frases del propio léxico); redacciones independientes: izquierda 32,7 y derecha «insuficiente» (2 coincidencias); texto neutro (Consejo de Ministros) → «insuficiente», sin coincidencias.
- **Limitaciones:** en la XV la izquierda gobierna, así que parte del vocabulario mide «lenguaje de gobierno» frente a «lenguaje de oposición» (hemos reducido…, incompetencia del Gobierno…); es el límite del método con un solo parlamento. Hay frases coyunturales (casos judiciales) que caducan con la legislatura; se recalcula por legislatura. La lista de diputados «activos» publicada por el Congreso solo tiene 137 nombres en el momento de la descarga; con la de bajas cubre los 412 que han ocupado escaño.

### Feeds (`config/sources-es.json`)

Antes 11 de 34 fallaban (Servimedia ya estaba corregido). Corregidos y verificados con `check-feeds.mjs`: **La Razón** (`https://www.larazon.es/?outputType=xml`), **Onda Cero** (`https://www.ondacero.es/rss/8145.xml`), **laSexta** (`https://www.lasexta.com/rss/348128.xml`), **Antena 3** (`https://www.antena3.com/rss/347795.xml`), todas tomadas del `<link rel="alternate">` de la portada del propio medio. **Voz Pópuli**: la URL vigente anunciada por la web es `https://www.vozpopuli.com/portada.xml`, pero responde 403 a clientes sin navegador; se deja esa URL (la anterior daba 404).

Siguen fallando 7 (no se eluden bloqueos ni protección anti‑bots; no se quita ningún medio): `publico` (404; no se encontró feed vigente, la web ya no enlaza RSS), `cadenaser` (403), `ctxt` (403), `elperiodico` (406), `vozpopuli` (403), `eleconomista` (403), `efe` (403). Los cinco 403/406 son bloqueos a clientes sin navegador y probablemente funcionen desde la app; no se pueden confirmar con una petición cortés.

### Priors `config/outlet-priors.json`

Fuente única: **CIS, estudio 3421, «Audiencias de medios de comunicación social», sept‑oct 2023 (n = 27.433)**, tabulación por autoubicación ideológica (<https://www.cis.es/documents/d/guest/es3421creenciasmt_a>). El esquema ya admitía `fuente`, `url` y `fecha`; no se ha cambiado.

- `audiencia` (20 medios): autoubicación media (1 izquierda – 10 derecha) de quienes usan habitualmente el medio. El CIS publica el % de usuarios de cada medio por categoría de autoubicación (P3a prensa, P9a TV, P14a radio), no la media; la media es un **cálculo propio** ponderando por el tamaño muestral de cada categoría (y por el % que lee prensa / ve TV / escucha radio). Comprobación: con esos pesos se reproduce el % total publicado de cada medio con error ≤ 0,6 pt. Valores: El País 4,18; El Mundo 5,59; ABC 6,11; La Vanguardia 4,32; eldiario.es 2,96; La Razón 6,05; El Confidencial 5,11; Público 2,71; 20minutos 4,60; OKDIARIO 6,20; El Periódico 3,96; El Español 5,78; Expansión 5,80; infoLibre 2,79; RTVE 4,45 (TVE1; RNE da 4,47); Antena 3 5,70; laSexta 3,89; Cadena SER 3,71; COPE 6,51; Onda Cero 5,52. Se añadieron al fichero los medios okdiario, infolibre, elperiodico y expansion.
- `externas` (12 medios): lo que la población asigna a la línea editorial del medio (P22 prensa, P23 TV, P24 radio; media publicada por el CIS, excluye NS/NC): El País 4,16; El Mundo 6,92; La Vanguardia 5,48; eldiario.es 4,47; ABC 7,79; La Razón 7,66; Antena 3 6,34; TVE1 4,35; laSexta 3,75; Cadena SER 3,97; COPE 7,90; Onda Cero 6,14.
- **Sin dato (se deja `null`/vacío, no se inventa):** sin `audiencia` quedan los medios que el CIS no desglosa (Libertad Digital, El Debate, The Objective, HuffPost, El Salto, CTXT, Servimedia, EFE, Europa Press, Maldita, Newtral, Voz Pópuli, Cinco Días, elEconomista, Público en externas…). `externas` vacío en todos los que no figuran en P22–P24 (todos los digitales salvo eldiario.es, y la prensa económica). No se rellenó nada con el Digital News Report del Reuters Institute (publica alcance y confianza por marca, no posición política) ni con clasificaciones de terceros no verificables.
- **Matiz de uso:** los lectores se sitúan algo más a la izquierda/centro que la línea de su medio (p. ej. El Mundo 5,59 frente a 6,92); la autoubicación de la audiencia es una señal más moderada que la línea editorial, y con peso 0,25 la combinación tira hacia el centro.
