# newpaper — Especificación de diseño

**Fecha:** 2026-10-06
**Estado:** aprobado para planificación
**Mockups de referencia:** https://claude.ai/artifact/SJ8oMEfjRhXS2k4kWJYcbv (pizarra con todas las pantallas de escritorio y móvil)

## 1. Qué es

newpaper es un navegador de escritorio **solo para leer noticias**, de uso personal. Bloquea anuncios y rastreadores, puede salir a internet por Tor eligiendo el país de salida, y usa IA para **contrastar** cada noticia: extrae sus afirmaciones, busca coberturas del mismo hecho en medios de todo el espectro, verifica contra fuentes primarias, puntúa la neutralidad y redacta una **noticia neutral** con fuentes, tablas y gráficos. Un agente responde preguntas sobre el artículo o sobre un fragmento seleccionado, citando fuentes.

### Objetivos

- Leer cualquier noticia en un lector limpio, con análisis de sesgo y veredictos por afirmación.
- Contrastar cada hecho con varias coberturas equilibradas y fuentes primarias.
- Mostrar siempre las pruebas (fuentes, discrepancias) en vez de un juicio opaco.
- Privacidad: bloqueo fuerte, Tor integrado, IA local posible, claves en el llavero del sistema.
- Todo configurable: proveedores de IA por paso del pipeline, fuentes, cuándo analizar, red.

### No objetivos

- **No** se saltan muros de pago ni controles de acceso (descartado explícitamente). Se respeta lo que la web entrega; las sesiones del usuario sí se usan.
- No es un navegador generalista (sin extensiones, sin sincronización en la nube, sin cuentas).
- No garantiza "la verdad": ofrece la versión mejor respaldada por pruebas y muestra las discrepancias.
- Móvil: fuera de la primera entrega; se diseña para reutilizar núcleo y pipeline (ver §13).

## 2. Arquitectura

```
┌──────────────────────── Ventana Tauri 2 (Windows, WebView2) ────────────────────────┐
│  Webview UI (React + TS, local)          │  Webviews de contenido (una por pestaña)  │
│  - barra, pestañas, lector, panel        │  - cargan la web remota original           │
│  - pipeline IA (packages/pipeline)       │  - script de extracción inyectado          │
│  - agente, síntesis, ajustes, páginas    │  - sin acceso a la IPC de Tauri             │
└───────────────▲──────────────────────────┴───────────────▲───────────────────────────┘
                │ IPC Tauri (comandos tipados)               │ WebView2 WebMessage (nativo)
┌───────────────┴──────────────────── Núcleo Rust ─────────┴───────────────────────────┐
│ np-shell   ventanas, pestañas, webviews, navegación, errores, cuelgues               │
│ np-adblock adblock-rust + WebResourceRequested                                        │
│ np-net     Arti (Tor) + proxy SOCKS5 local + país de salida + kill switch           │
│ np-store   SQLite (rusqlite) + migraciones; llavero (keyring)                       │
│ np-feeds   RSS (feed-rs), índice, agrupación por hechos, búsqueda de respaldo        │
│ np-wayback cliente CDX / capturas del Internet Archive                              │
│ np-ai-proxy fetch de LLM con inyección de claves (las claves nunca llegan a JS)      │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

Decisión clave (opción 1 aprobada): **lo robusto y de bajo nivel en Rust; lo que cambia a menudo (prompts, proveedores, lógica de contraste) en TypeScript** con Vercel AI SDK.

### 2.1 Repositorio

Monorepo pnpm + workspace Cargo:

```
newpaper/
  src-tauri/                  app Tauri (crate np-app) + workspace Cargo
    crates/np-shell  np-adblock  np-net  np-store  np-feeds  np-wayback  np-ai-proxy
  apps/ui/                    React 19 + Vite + TypeScript (webview UI)
  packages/pipeline/          etapas, esquemas zod, proveedores, costes (TS puro, testeable sin Tauri)
  packages/ui-kit/            tokens de diseño, componentes (lector, gráficos SVG, panel)
  config/                     sources.json, outlet-priors.json, prices.json, filtros por defecto
  docs/superpowers/           specs y planes
```

### 2.2 Pila

| Área | Elección |
|---|---|
| Contenedor | Tauri 2 (Windows primero), WebView2, ventanas con multi-webview |
| UI | React 19, Vite, TypeScript estricto, CSS con tokens (sin framework CSS pesado) |
| IA | Vercel AI SDK (`ai`) + proveedores oficiales; `generateObject` con zod |
| Bloqueo | crate `adblock` (adblock-rust de Brave) |
| Tor | `arti-client` con feature `geoip` (`StreamPrefs::exit_country`) |
| Datos | SQLite vía `rusqlite` (bundled), migraciones versionadas |
| Claves | crate `keyring` (Credential Manager de Windows) |
| RSS | `reqwest` + `feed-rs` |
| Extracción | `@mozilla/readability` inyectado en la webview de contenido |
| Tests | `cargo test`, Vitest, WebdriverIO + `tauri-driver` para e2e |

## 3. Navegador (np-shell + UI)

- **Pestañas:** cada pestaña es una webview de contenido hija de la ventana principal; la webview UI dibuja la barra y el panel. Las webviews de contenido **no** tienen capacidades IPC de Tauri.
- **Lector por defecto:** al cargar una página reconocida como noticia, el script inyectado ejecuta Readability y envía `{url, title, byline, published, html, text, lang}` por `chrome.webview.postMessage`. La UI muestra el artículo en su **propio lector** (Newsreader, tema Papel/Tinta). "Ver original" muestra la webview de contenido.
- **Detección de noticia:** dominio en la lista de medios, o metadatos `og:type=article` / JSON-LD `NewsArticle`.
- **Navegación y errores:** `NavigationCompleted` con `WebErrorStatus` → página de error de la app (sin conexión, Tor bloqueado (403/CAPTCHA en salida Tor), certificado no válido, tiempo agotado, 404). `ProcessFailed` → página de cuelgue con recarga.
- **Páginas internas:** `newpaper://inicio`, `newpaper://sintesis/<id>`, `newpaper://hemeroteca/<url>`, `newpaper://ajustes/<sección>`, `newpaper://sin-conexion` (con el tres en raya).
- **Atajos:** Ctrl+L buscar, Ctrl+T pestaña, Ctrl+Shift+A analizar, Ctrl+K preguntar al agente sobre la selección.

## 4. Privacidad y red (np-adblock, np-net)

### 4.1 Bloqueo
- Motor `adblock::Engine` con EasyList, EasyPrivacy, filtros de uBlock Origin, listas de banners de cookies y de modales de suscripción. Listas descargadas al primer arranque y cada 24 h (por Tor si está activo); copia embebida de respaldo.
- Intercepción con `ICoreWebView2::add_WebResourceRequested` (filtro `*`), devolviendo 403 vacío a lo bloqueado. Cosméticos (ocultar banners) vía script de inyección con selectores del motor.
- Contadores por pestaña y por día (UI: escudo con número).

### 4.2 Modos de red
| Modo | Implementación |
|---|---|
| Directo | sin proxy |
| Tor | Arti embebido; proxy SOCKS5 local en `127.0.0.1:<puerto aleatorio>` servido por np-net; WebView2 creado con `--proxy-server=socks5://127.0.0.1:<p>` (DNS resuelto en remoto) y `--force-webrtc-ip-handling-policy=disable_non_proxied_udp` |
| WireGuard | **fase 2**: importar `.conf`; fuera del primer alcance |

- **País de salida:** `StreamPrefs::exit_country(cc)`; "automático" = sin restricción. Cambiar de país o de modo **recrea el entorno WebView2** (2 s aprox.) y recarga las pestañas.
- **Nuevo circuito:** aislar flujos con un nuevo `IsolationToken`.
- **Kill switch:** si Arti no está listo o cae, el proxy rechaza conexiones; nunca hay vuelta silenciosa a directo. Abrir sin Tor es una acción explícita por pestaña con aviso.
- Las peticiones de IA y RSS siguen el modo de red salvo que el ajuste "IA por Tor" esté desactivado (por defecto: RSS por Tor, IA directa).

## 5. Fuentes, coberturas e historial (np-feeds, np-wayback)

### 5.1 Índice RSS
- `config/sources.json`: medios con `id, nombre, dominio, feeds[], pais, idioma`. Lista inicial de 34 medios españoles y agencias, equilibrada.
- Descarga cada 15 min; guarda artículos (url, título, resumen, fecha, medio) en SQLite con FTS5.
- **Agrupación por hechos:** similitud TF‑IDF sobre título+resumen normalizados (minúsculas, sin acentos, sin stopwords en español) dentro de una ventana de 72 h; umbral configurable. Un "hecho" agrupa artículos de varios medios. (Embeddings locales con Ollama como mejora opcional.)
- **Búsqueda de respaldo:** si un hecho tiene < 3 coberturas, consulta un proveedor (Brave Search API por defecto; Tavily/Exa opcionales) y añade resultados de dominios de medios.

### 5.2 Línea editorial de cada medio
La posición **se mide, no se asigna**, y **nunca altera la nota de un artículo**: solo sirve para equilibrar con qué se contrasta.
- `posicion = 0,60·propia + 0,25·audiencia + 0,15·externa` en escala 0 (izquierda) – 100 (derecha).
  - *Propia:* media de los encuadres (`framing` de la etapa Puntuar) de los artículos del medio en 90 días.
  - *Audiencia:* autoubicación de sus lectores según encuestas públicas, en `config/outlet-priors.json`.
  - *Externa:* clasificaciones públicas cuando existan, en el mismo fichero.
- Incertidumbre = error estándar de la propia combinada con la dispersión de las priors; se muestra como franja (p. ej. 30 ± 9).
- Desglose por tema (economía, inmigración, territorial…) y **fiabilidad factual** como eje separado (% de afirmaciones verificadas correctas).
- Corrección manual del usuario guardada como `override` y marcada en la UI.

### 5.3 Hemeroteca (Wayback Machine)
- CDX: `https://web.archive.org/cdx/search/cdx?url=<url>&output=json&fl=timestamp,digest,statuscode&filter=statuscode:200&collapse=digest` (cache 6 h).
- Captura cruda: `https://web.archive.org/web/<ts>id_/<url>`, extraída con Readability (en una webview oculta).
- Se comparan capturas con distinto `digest` (máx. 12) → lista de **ediciones** con hora y tipo (titular, dato, párrafo añadido/eliminado) mediante diff por palabras (LCS). "Editada N veces sin aviso" si no aparece un texto de rectificación ("rectificación", "actualización", "fe de erratas", "corrección").
- La UI es la de newpaper (línea de tiempo, A/B, Unificado / Lado a lado / Leer captura), nunca la de Wayback.

## 6. Pipeline de IA (packages/pipeline + np-ai-proxy)

### 6.1 Proveedores
Anthropic, OpenAI, Google Gemini, DeepSeek, xAI (Grok), Mistral, Perplexity, OpenRouter, Groq, Hugging Face, Ollama (local), LM Studio (local) y cualquier endpoint compatible con OpenAI.
- Cada proveedor del AI SDK recibe un `fetch` personalizado que llama al comando Rust `ai_fetch(provider_id, request)`; **Rust añade la cabecera de autenticación leyendo la clave del llavero**, aplica el modo de red y devuelve la respuesta (streaming por canal de eventos). Las claves nunca están en la webview.
- Registro de modelos y precios en `config/prices.json` (editable), con `coste_entrada/salida por 1M tokens` y `local: bool`.
- "Probar conexión": petición mínima por proveedor con latencia.

### 6.2 Etapas
| # | Etapa | Tipo | Salida (zod) |
|---|---|---|---|
| 1 | Extraer artículo | sin IA (Readability) | `Article` |
| 2 | Detectar afirmaciones | LLM | `Claim[] {id, quote, span:[ini,fin], kind: hecho\|cifra\|opinion\|atribucion, checkable}` + `loadedPhrases[] {quote, span, reason}` |
| 3 | Buscar coberturas | sin IA (np-feeds) | `Coverage[] {outlet, url, title, lean}` (equilibradas izq/centro/der) |
| 4 | Verificar datos | LLM + fetch de fuentes | `Verdict[] {claimId, status: verificado\|enganoso\|falso\|falta_contexto\|opinion\|no_verificable, explanation, sources[]}` |
| 5 | Puntuar neutralidad | LLM | `Score {neutrality 0-100, framing 0-100, loadedLanguage, voices {gobierno,patronal,sindicatos,expertos,...}, omissions[], verdict}` |
| 6 | Síntesis, tablas y gráficos | LLM | `Synthesis {headline, summary3[], facts[], parties[], disputes[], unknowns[], visualizations[], rewrites[]}` |
| 7 | Detector de texto IA (opcional) | heurística + LLM | `AiAuthorship {probability, paragraphs[], signals[]}` |
| 8 | Agente | LLM con herramientas | respuesta en streaming con citas |

- **Análisis rápido** (al abrir, configurable): etapas 2 (solo `loadedPhrases`) y 5 parcial con un modelo local; nota provisional.
- **Análisis completo** (al pulsar o automático según reglas): etapas 2–7 con los modelos asignados.
- **Fuentes primarias para verificar:** lista blanca configurable (INE, Eurostat, BOE, Banco de España, AIReF, Maldita, Newtral, Moncloa…); la etapa 4 consulta coberturas + búsqueda restringida a esos dominios y **cita solo URLs realmente recuperadas** (validación: toda `source.url` debe existir en el conjunto recuperado; si no, se descarta).
- **Visualizaciones:** `{type: bar|line|range|stacked|matrix|table, title, unit?, data, sourceIds[]}`; el render es de `ui-kit` (SVG propio, tokens del tema). Datos sin fuente → no se dibujan.
- **Reescrituras (modo Cambios):** `{from, to, reason}` alineadas con spans del original.
- **Asignación por etapa:** `{provider, model, temperature, fallback}`; presets *Privacidad total*, *Equilibrado*, *Máxima calidad*, *Mínimo coste*. Si el modelo falla, se usa el `fallback` (por defecto Ollama).
- **Coste:** estimado por etapa con tokens aproximados × `prices.json`; límite mensual: al alcanzarlo, el análisis completo pasa a modelos locales. Contabilidad real con `usage` de cada respuesta.
- **Caché:** resultados por `hash(url + texto)` 30 días; reutilización entre pestañas del mismo hecho.

### 6.3 Detección de texto generado con IA
- Señales: uniformidad de longitud de frases (baja varianza/"burstiness"), lista de frases plantilla, repetición de estructuras, ausencia de credenciales C2PA en imágenes del artículo, y un juicio LLM opcional.
- Salida probabilística por párrafo; la UI siempre muestra el descargo "indicio, no prueba".

### 6.4 Hecho sin cobertura
- Condición: < 3 coberturas y 0 fuentes primarias tras la búsqueda de respaldo.
- Opciones: "Avisarme cuando haya cobertura" (vigila el índice) o "Investigar con IA…".
- La investigación **exige confirmación en cada uso** (casilla obligatoria, sin "no volver a preguntar"). Resultado marcado `unverified: true`, con etiqueta por frase (fuente única, solo en redes…), confianza baja y lista "Cómo comprobarlo tú".

### 6.5 Agente
- Contexto: artículo, coberturas, fuentes recuperadas, veredictos y, si existe, el **fragmento seleccionado**.
- Modos: Preguntar, Verificar, Explicar.
- Herramientas: `searchCoverage`, `fetchSource` (lista blanca + coberturas), `getVerdicts`. Respuesta con citas numeradas que deben mapear a fuentes recuperadas.
- Entradas: barra flotante al seleccionar texto, clic derecho (Preguntar / Verificar / Explicar), botón por afirmación, pestaña "Agente" del panel.

## 7. Datos (np-store, SQLite)

Tablas principales: `outlets`, `feeds`, `articles` (+ FTS5), `events` (hechos) y `event_articles`, `analyses` (url, text_hash, stage, json, model, cost, created_at), `outlet_stats` (framing medio, n, por tema, fiabilidad), `outlet_overrides`, `wayback_captures`, `settings` (clave-valor JSON tipado), `blocked_stats`, `watches` (hechos vigilados), `usage` (coste mensual). Migraciones con `user_version`.

## 8. Interfaz

Fuente de verdad visual: la pizarra de mockups. Resumen:
- **Estética "papel":** fondo #F6F4EF, tinta #17171A, Newsreader (lectura), IBM Plex Sans (UI), IBM Plex Mono (metadatos); acento azul tinta #2340B8; Tor violeta #4A2FB8; IA detectada magenta #993556; estados ok/aviso/error en verde/ámbar/rojo. Tema Tinta (oscuro) por tokens.
- **Movimiento:** curva `cubic-bezier(.22,1,.36,1)`, rebote `(.34,1.56,.64,1)`; respeta `prefers-reduced-motion`.
- **Pantallas:** navegador + panel (Análisis / Coberturas / Agente, lente de sesgo, eje de encuadre, afirmaciones), síntesis (Breve / Completa / Cambios, gráficos, partes, disputa), hemeroteca, hecho sin cobertura, nueva pestaña (saludo, buscador con sugerencias, briefing, temas, continuar), ajustes (Red con mapa, IA con proveedores y pipeline, Análisis, Fuentes con eje, Bloqueo, Apariencia, Datos), popup compacto de Tor con selector de flechas y avión, 404 con columnas rotatorias, errores de red, cuelgue, tres en raya sin conexión, recorrido de bienvenida, instalador.
- **Accesibilidad:** objetivos ≥ 44 px, botones reales, `aria-*`, contraste AA, navegación por teclado completa del panel.

## 9. Primer arranque

- **Instalador v1:** bundle NSIS de Tauri, instalación por usuario, marca de newpaper (imágenes, español), opciones: acceso directo, iniciar con Windows, abrir enlaces de noticias, importar marcadores, incluir Tor, descargar modelo local (vía Ollama si está instalado). **Instalador v2** (aspecto exacto del mockup): mini app Tauri "setup" que descarga y coloca la app — fase posterior.
- **Actualizaciones:** `tauri-plugin-updater` con firma.
- **Recorrido:** bienvenida → 3 pasos (temas, IA, red) → 6 marcas sobre la interfaz real (lente, frase, nota, noticia neutral, Tor, ajustes) → "Listo". Repetible desde Ajustes.

## 10. Errores y degradación

- Proveedor IA caído o sin clave → fallback configurado → si no hay, análisis rápido local y aviso discreto.
- Sin coberturas → §6.4. Sin red → página sin conexión con lectura de guardados y el juego.
- Arti no arranca → estado "Tor no disponible", nada sale por directo sin acción explícita.
- Toda salida de LLM se valida con zod; inválida → 1 reintento con el error como feedback → si falla, se marca la etapa como fallida y la UI lo indica sin romper el resto.
- Fuentes citadas no recuperadas → se eliminan del resultado y se registra.

## 11. Seguridad

- Webviews de contenido sin IPC de Tauri; comunicación solo por WebMessage con mensajes validados (esquema y tamaño) en Rust.
- CSP estricta en la webview UI; sin `eval`.
- El HTML de artículos se renderiza **sanitizado** (DOMPurify) en el lector.
- Texto de páginas, coberturas y fuentes entra en prompts como **datos delimitados** (marcadores con nonce) con instrucción de no obedecerlo.
- Claves solo en el llavero; exportación de ajustes sin claves.

## 12. Pruebas

- **Rust:** unitarios (reglas de bloqueo, parser CDX, diff por palabras, agregación de línea editorial, agrupación por hechos con fixtures), integración de proxy SOCKS con Arti en modo test.
- **pipeline (TS):** Vitest con los modelos simulados de `ai/test` (versión que corresponda al AI SDK instalado) y fixtures del artículo de ejemplo; tests de validación de citas, presets, cálculo de costes y fallback.
- **UI:** tests de componentes (Vitest + Testing Library) para lector, panel, gráficos y ajustes.
- **e2e:** WebdriverIO + `tauri-driver` en Windows: abrir noticia de fixture local, análisis rápido, completo con proveedor simulado, preguntar por selección, cambiar país de Tor (con Arti simulado).

## 13. Móvil (fase posterior)

Tauri 2 para Android e iOS reutilizando `packages/pipeline`, `ui-kit` y crates de núcleo compatibles. Producto: lector + **compartir para analizar** (Android intent filter / iOS share extension), pantallas M0–M10 de la pizarra. Bloqueo vía `shouldInterceptRequest` (Android) y content blockers de WebKit (iOS); Tor con Arti y proxy por webview; IA local a través del Ollama del PC (red local o Tailscale).

## 14. Descomposición en subproyectos

Cada uno tiene su plan en `docs/superpowers/plans/`:

| # | Subproyecto | Depende de |
|---|---|---|
| 1 | Núcleo del navegador: monorepo, Tauri, pestañas, lector, almacenamiento, ajustes, ui-kit | — |
| 2 | Privacidad y red: adblock, Tor (Arti) con país, kill switch | 1 |
| 3 | Fuentes: índice RSS, hechos, búsqueda de respaldo, línea editorial, Wayback | 1 |
| 4 | Pipeline de IA: proveedores con proxy de claves, etapas, esquemas, costes, caché, detector IA, sin cobertura, agente | 1 (y 3 para coberturas) |
| 5 | Experiencia de análisis: panel, lente, selección→agente, síntesis con gráficos, hemeroteca, sin cobertura | 1, 3, 4 |
| 6 | Primer arranque y sistema: instalador, actualizaciones, recorrido, páginas de error/404/cuelgue, tres en raya | 1 |
| 7 | Móvil | 1–5 |

Orden recomendado: 1 → (2, 3 en paralelo) → 4 → 5 → 6 → 7.
