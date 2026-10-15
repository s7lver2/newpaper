# Erratas del plan 05 (experiencia de análisis)

Registro de errores y desviaciones encontrados al ejecutar el plan y cómo se corrigieron.

| Tarea | Error o desviación | Corrección | Commit |
|---|---|---|---|
| 1 | El armazón del plan no contempla que `main` ya contiene `PageTransition`, `NativeUnderlay` y `ContextMenuHost` | Se mantienen dentro de `main`; el hueco lateral se añade como hermano dentro de `.np-workspace` | de58f1e |
| 6 | El plan pasa `rewriteImage` directamente a `ReaderView`, lo que pierde el Referer (`?r=`) que usa el lector por defecto | Se envuelve como `rewriteImage(abs, page.url)` (igual que `ArticleReader`) | 365556d |
| 8 | `VisualizationView` (mapa) usa `map ?? table`, pero un elemento JSX nunca es nulo: el fallback a tabla con códigos desconocidos no se llegaría a usar | La decisión se toma con `gridFor(codes) !== null` antes de montar el mapa | 64fcc49 |
| 8 | `@newpaper/pipeline` se usa solo para tipos desde ui-kit y el plan no lo declara en `package.json` de forma explícita | Se añade como `peerDependencies` y `devDependencies` (`workspace:*`) y se actualiza `pnpm-lock.yaml` | 64fcc49 |
| 2 | El plan pide `pnpm --filter @newpaper/i18n test` y los textos deben coincidir en los tres idiomas: el fragmento de `settings` se fusiona a mano en el JSON (sin reformatear) | Fusión por script a nivel de objeto JSON; los ficheros mantienen su formato | 6f3ce77 |
| 9 | `SegmentedControl` del ui-kit tipa `onChange` como `(v: string)`; el plan pasa el setter de `useState<AgentMode>` (TS2322) | Callback con cast a `AgentMode` (mismo patrón que la tarea 6 del plan 01) | 8d2b809 |
| 9 | Un `sed` de la sección CSS dejó una valla ```` ```css ```` sobrante en `analysis.css` al añadir reglas | Se elimina la línea sobrante antes de commit | 8d2b809 |
| 10 | El test de `ConsentDialog` usa `rerender` sin el `I18nProvider` (`useI18n must be used inside <I18nProvider>`) | Los `rerender` envuelven el componente en `I18nProvider` (la nota del plan ya lo prevenía) | b70a281 |
| 14 | `startAutoAnalysis()` se llama al importar `features` y rechaza sin el puente de Tauri (`transformCallback`): error no capturado en los tests de `App` | `.catch(() => undefined)` en el registro: sin puente no hay análisis automático, pero no se rompe el arranque | 28fe61c |
| 15 | Mismo `SegmentedControl` con `setState` como `onChange` que en la tarea 9 (TS2322) | Cast a `View` | d0f4e5f |
| 17 | `ai_set_endpoints` recibe `{id, name, models, baseUrl}` según el plan, pero `CustomEndpoint` (Rust y TS, errata 21 del plan 04) es `{id, baseUrl, auth, local}` (TS2353) | Se envía solo esa forma: `auth` = `bearer` con clave o `none`; `local` = URL de bucle invertido. Los modelos del endpoint propio viven en la asignación, como indica el plan | a00dd24 |
| 17 | La clave del endpoint propio no se guardaba: `secretSet` solo se llamaba para proveedores `cloud` | Se guarda también para `custom` en `ai.custom` (id fijo, coincide con `secret_key`) | a00dd24 |
| 17 | El plan pide un campo «Nombre» para el endpoint propio, pero el tipo no tiene nombre y no hay dónde persistirlo | Campo retirado; el endpoint se muestra como «Compatible con OpenAI» | a00dd24 |
| 20 | El e2e del plan pide `pnpm e2e` (build con `cargo build` y tauri-driver). Regla del usuario: sin e2e completo | Se escriben el proveedor simulado, la fixture y la especificación, y se comprueban con `tsc` del paquete e2e; no se ejecutan | 58dd083 |
| 20 | La especificación del plan envía `ai_set_endpoints` con `name` y `models` (forma antigua de `CustomEndpoint`) | Se usa `{id, baseUrl, auth: 'bearer', local: true}` | 58dd083 |
| 20 | Las respuestas JSON del proveedor simulado no se han contrastado con los esquemas zod de cada etapa (los mensajes de sistema sí coinciden con `packages/pipeline/src/stages`) | Pendiente de validar al ejecutar el e2e | - |

## Pendiente y no verificado

- **Lanzamiento visual no hecho**: la app no se ha arrancado ni se ha comparado con los mockups píxel a píxel. Solo se han comprobado tipos, tests unitarios y el build de producción de `apps/ui`.
- **E2E (tarea 20) no ejecutado** por la regla de no ejecutar e2e completos. Las respuestas del proveedor simulado no se han contrastado con los esquemas.
- **`blocError` y `mirrorCheck` del plan 04**: `mirrorCheck` se usa en la pestaña de posición (tarea 12). `blocError` no aparece en el plan 05 y sigue sin conectarse.
- **Caché del pipeline sin idioma ni modelo en la clave**: el plan 05 no lo pide y cambiar la clave rompería `np-feeds/stats.rs` (errata 04). Sin cambios.
- **Tests de la tarea 2 (i18n)** pasan con las claves nuevas, pero no se ha hecho revisión de traducciones al alemán e inglés.
- **Investigación desde la nueva pestaña**: `NewTabPage` pasa una URL `newpaper://inicio?q=…` como artículo al pipeline. Funciona con el consentimiento obligatorio, pero conviene revisar esa URL falsa en el siguiente plan.

## Verificación visual y funcional

Verificado en la app real (build `custom-protocol`, `NP_FAKE_TOR=1`, CDP + capturas de ventana) contra los mockups servidos con `design/mockups/serve.mjs`, con el proveedor simulado de `e2e/fixtures/mockLlm.ts` (nunca proveedores reales). La UI se iteró sirviendo `apps/ui/dist` por CDP; el binario final se compiló aparte (`target/verify`).

### Errores encontrados y corregidos

| Pantalla | Hallazgo | Corrección | Commit |
|---|---|---|---|
| Lector | Las marcas de la lente no tenían fondo: `.np-lens mark` (0,1,1) ganaba a `.np-mark--*` (0,1,0) | `:where(.np-lens)`; colores de veredicto como tokens papel/tinta | a50e554 |
| Lector | `AnalysisReader` sustituía al lector por defecto: se perdían tamaño de texto, progreso, aviso de suscripción y el lector de portadas | Ahora envuelve a `DefaultReader` (`ReaderEnhance`) | a50e554 |
| Lector | Una regla de `analysis.css` pisaba `.np-reader-meta` del lector por defecto | Eliminada | a50e554 |
| Hecho sin cobertura | El diálogo de consentimiento quedaba atrapado dentro del panel (`position: fixed` bajo una animación con transform) y no usaba `useUnderlay` (la webview nativa lo habría tapado); Escape cerraba también el panel | Portal a `.np-root`, `useUnderlay`, `stopPropagation`; la casilla sigue siendo obligatoria en cada uso (el botón muestra el error en vez de estar deshabilitado, como el mockup) | a50e554 |
| Ajustes › IA | `ai_set_endpoints` con el id fijo `custom` fallaba con `unknown provider: custom` (Rust solo admitía `custom:*`, `ollama`, `lmstudio`): el endpoint propio no funcionaba | `upsert_custom` admite `custom`; probado en la app y con test | 03e79f5 |
| Ajustes › IA | «Gastado este mes: -0,00 US$» (suma vacía de f64 = -0.0) | Rust `+ 0.0` y formateadores i18n | 03e79f5, 1437d7c |
| Nueva pestaña | «hace 20.715 días»: `latestAt` está en segundos | Conversión correcta y hora/minuto/día | cd9712a |
| Nueva pestaña | Riesgo marcado por el informe: URL falsa `newpaper://inicio?q=…` como artículo. Evaluado: la etapa `investigate` solo lee `article.text` y la URL (válida para el esquema) no toca caché, historial ni `onAnalyzed`; el fallo real era que no había estado de carga ni de error | Estados `busy` y error; la URL se mantiene como marcador documentado | cd9712a |
| Pestañas | Las páginas internas nuevas se titulaban «Sin título» | Títulos para síntesis, hemeroteca, historial y posición | a50e554 |
| Síntesis | Los gráficos SVG dibujaban sus textos al doble de tamaño (viewBox 320) | viewBox 480 en barras, línea y rangos; marco de tarjeta como el mockup | cd9712a |
| Ajustes | El asistente de proveedores se pintaba dentro del Ajustes con barra lateral | Página completa para subpasos de Ajustes | fa9c235 |
| Mock LLM | Respuestas JSON contrastadas con los esquemas zod: claims, loaded phrases, verdicts, juez, síntesis, no cubierto y aiDetect validan y producen análisis rápido, completo, agente e investigación en la app real | Sin cambios | - |

### Fidelidad con los mockups (rediseñado)

Main (lector con lente, banner de IA, etiquetas «IA» al margen, barra de selección, panel de 440 px con anillo serif, eje con otras coberturas, métricas, afirmaciones desplegables, Coberturas, Agente estrecho y amplio, nota en la pestaña, botón de la barra), SinCobertura (tarjeta, diálogo, informe discontinuo), Posicion (ahora la página `newpaper://analisis/posicion?tab=`, no un detalle del panel), Síntesis, Inicio e Historial (ajustes de estilo). Papel y tinta revisados en Main; sin errores en consola durante la navegación por las páginas internas.

### Decisiones y diferencias que se mantienen

- Posicion: el bloque «Validación ciega» no se muestra (no hay informe real) y el léxico calibrado aparece como «no disponible» porque `config/lexicon-es.json` está en estado `pending` (sin frases).
- Main: la fila «Editada N veces sin aviso» es un enlace a la hemeroteca sin cifra (requeriría consultar Wayback al abrir el panel). «Medio: izquierda · 12 ± 8» solo sale si el medio está en la lista de fuentes.
- Colores de veredicto según el mockup: «Falta contexto» y «Falso» en rojo, «Opinión» en gris.
- El texto de consentimiento no promete «redes sociales y foros» (el pipeline no los consulta).
- Con el análisis solo en memoria, recargar la UI pierde el estado hasta que la pestaña vuelve a emitir su evento.

### Pendiente (no verificado o sin igualar al mockup)

- Hemeroteca: no se ha podido ver con datos (necesita Wayback; con una URL local no devuelve capturas) y no se ha comparado píxel a píxel.
- Proveedores (asistente) y Ajustes › IA: rehechos para coincidir con los mockups (ver «Ajuste del asistente de proveedores y Ajustes › IA» más abajo).
- Historial: sin columna lateral (conservar, pausar, sincronización), iconos de medio ni pestañas con contadores.
- Gráficos de la síntesis: marco y escala corregidos, pero sin selector Barras/Línea/Tabla en la tarjeta, valor destacado ni barra rayada del dato provisional; la matriz no usa chips de color.
- Nueva pestaña: sin la tarjeta «Continúa leyendo» con progreso ni el pie de página.
- No se ha probado `useUnderlay` con la vista original visible (solo lector, donde la webview nativa está oculta) ni el atajo Ctrl+K sobre la webview nativa; sí funcionan el botón de la barra y la selección en el lector.
- e2e: especificación actualizada a los nuevos selectores; sigue sin ejecutarse.

## Ajuste del asistente de proveedores y Ajustes › IA

El usuario señaló que el asistente (`newpaper://ajustes/ia/conectar`) y la pestaña Ajustes › IA no se parecían a los mockups. Se rehicieron ambos contra `Proveedores.dc.html` y `Ajustes.dc.html`, midiendo con `getBoundingClientRect`/capturas del mockup servido (Chrome sin cabeza, 1280 px) frente a la app real (build `custom-protocol` con el proveedor simulado local; nunca proveedores reales ni claves reales). Papel y tinta revisados a 1280 px y a 760–820 px de ancho.

### Qué se hizo

- **Asistente (3 pasos)**: indicador de pasos con pista animada, tarjetas «Recomendados» (ChatGPT y Nous), recuadro de «Pega tu clave» con reconocimiento por prefijo (logo que rebota, «Es de X», lista si el prefijo es ambiguo, aviso si no se reconoce), cuadrícula «Nube» con 10 proveedores, «En tu equipo» (Ollama y LM Studio con la etiqueta «detectado» cuando la sonda los encuentra) y «Avanzado» (endpoint compatible con OpenAI). Paso 2 con la tarjeta de la clave (detección del prefijo en vivo, aviso de privacidad) y la columna «¿No tienes clave?» (abrir la web del proveedor, tres pasos, nota extra para OpenAI y Gemini). Paso 3 con las tres comprobaciones animadas, el esqueleto «Asignando modelos…», la tarjeta «Asignado automáticamente» (6 pasos con modelo, dónde corre y coste, total y límite mensual, «Opciones avanzadas»), el estado de error y la tarjeta final («está conectado» / «Asistente cerrado»). Animaciones del mockup (`rise`, `swR/swL`, `bnc`, `drop`, `shut`, resorte del conmutador y de la flecha) como `np-*`; teclado: foco visible, Enter en los campos, Escape = un paso atrás (o cerrar), el cursor va al primer campo al entrar en el paso 2.
- **Ajustes › IA**: «Punto de partida» (4 presets con coste por noticia), «Proveedores» con filtros Todos/Activos/Nube/Local y 15 fichas con logo, el panel del proveedor (clave, dirección, modelos con coste por paso típico, conmutador, «Probar conexión»), «Pipeline de análisis» de 8 pasos con conectores animados, inspector (proveedor, modelo, creatividad, respaldo, coste y tiempo), resumen oscuro con franjas y «Límite de gasto mensual». Estado vacío «Conecta un proveedor» cuando no hay ninguno.
- **Barra lateral de Ajustes**: «Inteligencia artificial» y «Análisis» con icono y línea de resumen («Pipeline de 8 pasos» o «Sin proveedor»; «Automático», «Bajo demanda» o «Escalonado»), en el orden del mockup. La sección Análisis pasa a tener las tres tarjetas de disparo del mockup.
- **Logos**: los 12 SVG de una sola trazada que ya estaban en `design/mockups/assets/` (copiados a `features/providers/logos/`, sin red); Nous, Groq y el endpoint propio usan el monograma del mockup (`N`, `gq`, `{ }`). Se pintan con `currentColor`: en tinta la ficha se mezcla con el fondo de tarjeta.
- Las claves siguen yendo solo por `secret_set` al llavero. El estado de React las guarda hasta que se prueba la conexión y se vacía justo después (el campo pasa a «•••• guardada»); si el asistente se abandona sin terminar, se borra la clave del llavero (salvo que el proveedor ya estuviera conectado). Ninguna clave se escribe en ajustes ni en el registro.

### Diferencias que se mantienen

- Moneda: los precios del registro están en dólares, así que los importes salen en `$` (no en `€`). Los costes son estimaciones con un artículo de 6.000 caracteres y 5 coberturas (`estimateAnalysis`), no los números inventados del mockup.
- Se omiten los botones «Claves de ejemplo» / «Probar con una clave de ejemplo» (claves falsas de demostración que en la app real inducirían a probar una conexión con claves inventadas).
- Paso 3: una sola llamada real alimenta las tres comprobaciones, que se revelan una a una (el mockup las temporiza con retardos fijos). La burbuja «Listo para leer noticias contigo.» es un texto de la interfaz, no la respuesta del modelo (que es solo «ok»). El tiempo de la prueba solo aparece en «Responde en N ms».
- Endpoint propio: se mantiene el campo «Modelos (separados por comas)» que el mockup no tiene (no se listan modelos del servidor) y se oculta el botón «Consigue tu clave» (no hay URL).
- Tras abrir «Consigue tu clave» el aviso dice «Abierta en una pestaña nueva»: la web se abre en una pestaña de newpaper, no en el navegador del sistema.
- Ajustes › IA: falta el deslizador «Fuentes a contrastar por afirmación» (no hay ajuste ni parámetro en el pipeline que lo lea). El interruptor de un proveedor local queda desactivado: los locales se usan solos cuando están en marcha. El límite mensual usa 0 = «Sin límite» (no existe «límite de 0»). El interruptor de un proveedor en la nube conectado lo desconecta y borra su clave del llavero.
- En «Local» las etiquetas de modelos detectados se recortan con puntos suspensivos en lugar de romper la ficha a varias líneas (el mockup las parte en una columna estrecha).
- En tinta el bloque oscuro del resumen no se invierte a una franja clara: usa el negro de la barra de título sobre el fondo.
- Fuera de alcance, sin hacer: el buscador «Buscar ajuste» y el pie «newpaper 0.1 · Tauri 2 · WebView2» de la barra lateral; en Análisis, «Excepciones por medio» y los tres interruptores del mockup (no existen en el producto).
- Un fallo de conexión en el asistente solo distingue «ok / no ok» (`testConnection` devuelve un único error): se muestra como fallo del primer paso.

## Revisión de proveedores, login y abiertos/cerrados

Fecha de las comprobaciones: 2026-10-15. Todo lo de abajo sale de las páginas oficiales citadas o del catálogo público de OpenRouter/NVIDIA (`/models`, sin clave); no se hizo ninguna llamada a un modelo ni ningún inicio de sesión real.

### 1. Acceso con inicio de sesión

Capacidad genérica: cada proveedor puede declarar `login: { flow, status, authUrl?, exchangeUrl? }` en `config/providers.json`. `flow` = `oauth-pkce-key` (el proveedor devuelve una clave de API a cambio de un código) u `oauth-device` (reservado). `status` = `available` (verificado con documentación oficial; el único que se ejecuta), `unverified` o `gated` (marco listo, no se ejecuta). `AuthScheme` (cómo se inyecta la clave) no cambia: el login solo decide *cómo se consigue* la clave, que sigue en el llavero como `ai.<id>` y la sigue inyectando el proxy únicamente hacia el host del proveedor (sin redirecciones, sin claves en JS ni en registros).

| Método | Estado | Motivo | Fuente |
|---|---|---|---|
| OpenRouter, OAuth PKCE | **Real** (`available`) | Flujo oficial: `https://openrouter.ai/auth?callback_url&code_challenge&code_challenge_method=S256&state`, `POST https://openrouter.ai/api/v1/auth/keys` con `code` + `code_verifier` devuelve `{ key }`; códigos de un solo uso que caducan a los 10 min; callbacks en `localhost` con cualquier puerto permitidos; `state` se devuelve tal cual | openrouter.ai/docs/guides/overview/auth/oauth |
| Nous Portal, device-code | **Solo marco** (`unverified`; la interfaz muestra «experimental, no disponible» y deja la clave) | La documentación de Hermes (hermesagent.org.cn/en/docs/integrations/nous-portal) describe un login por navegador con callback local y un JWT corto minteado desde un refresh token, pero **no publica** URL de autorización, de token ni de device-code. Solo se confirmó en `hermes_cli/auth_constants.py` (NousResearch/hermes-agent) `DEFAULT_NOUS_CLIENT_ID = "hermes-cli"`, scope `inference:invoke`, portal `https://portal.nousresearch.com` e inferencia `https://inference-api.nousresearch.com/v1`. Ese `client_id` es el de la CLI de Hermes (no nuestro) y los endpoints del flujo no se pudieron confirmar: no se ha codificado nada. La vía con clave de API (portal › API Keys) sigue siendo la válida | páginas citadas |
| ChatGPT («Sign in with ChatGPT») | **Omitido** | Solo vista previa para integraciones aprobadas (reportes de prensa desde mayo de 2025, sin documentación pública de OAuth para terceros). No se toma prestado el `client_id` ni los tokens de Codex CLI. El marco admite añadirlo cuando OpenAI conceda acceso; mostrar «Próximamente» no aporta valor, así que no hay entrada | techcrunch.com/2025/05/27/openai-may-soon-let-you-sign-in-with-chatgpt-for-other-apps |
| Suscripción Claude (Pro/Max) | **No se implementa** | Las condiciones de Anthropic lo prohíben para apps de terceros (indicación del usuario). Claude se queda con clave de API; sin entrada `login` en el registro (lo comprueba un test) | - |
| Gemini | **Solo clave** | No existe un flujo OAuth oficial de facturación para terceros; la clave gratuita de AI Studio es fácil (enlace `aistudio.google.com/apikey`) | ai.google.dev |
| Hugging Face | **Marco listo, no habilitado** | Existe OAuth con scope `inference-api`, pero exige registrar una app OAuth que no tenemos y devolvería un token de acceso, no un intercambio por clave. Sin entrada `login` | huggingface.co/docs/inference-providers |

**Implementación (Rust, `np-ai-proxy::login` + comandos `ai_login`/`ai_login_cancel`)**

- PKCE S256: verificador de 64 caracteres hexadecimales (dos UUID v4 del SO, 244 bits), `code_challenge = BASE64URL(SHA-256(verifier))` (vector de RFC 7636 en un test) y `state` aleatorio de 128 bits. El verificador, el código y la clave solo existen en Rust; la clave va directa al llavero y no se devuelve a la interfaz.
- Redirección: oyente de un solo uso en `127.0.0.1` con puerto aleatorio (la URL de callback es `http://localhost:<puerto>/callback`, lo documentado por OpenRouter). Solo vale un `GET /callback` con el `state` correcto (comparación en tiempo constante) y `Host` = `localhost:<puerto>` o `127.0.0.1:<puerto>` (frena DNS rebinding); cualquier otra petición recibe 400 y se ignora (no se puede abortar un inicio de sesión legítimo enviando basura). Cabecera de petición máx. 8 KiB y 3 s por conexión. Caduca a los 5 min (`login_timeout`), se cierra al terminar, al cancelar y al salir del asistente, y un segundo callback con los mismos datos ya no encuentra a nadie escuchando (el código además es de un solo uso en el servidor).
- Se eligió el navegador del sistema (`rundll32 url.dll,FileProtocolHandler` / `open` / `xdg-open`, sin intérprete de comandos y solo para `https`) en lugar de una pestaña de newpaper: la persona ya suele tener allí la sesión y el gestor de contraseñas, y el callback loopback no depende de que newpaper permita navegar a `localhost`. Si no se puede abrir, la interfaz ofrece «Copiar enlace».
- Validación en la tabla de proveedores: `authUrl`/`exchangeUrl` deben ser https y del mismo host y puerto que `baseUrl` (si no, el registro no carga); un `login` marcado `available` debe ser un flujo PKCE completo.
- Intercambio con el cliente estricto del proxy (sin redirecciones; mismo enrutado Tor/directo que las llamadas de IA), tope de 64 KiB de respuesta, clave de 8–512 caracteres ASCII imprimibles; los errores no repiten el cuerpo del proveedor.
- No hay refresco de tokens: el flujo de OpenRouter entrega una clave de larga duración controlada por el usuario (revocable en openrouter.ai/settings/keys), no un token que caduque.
- Gancho de pruebas (solo compilaciones con `debug_assertions`): `NP_TEST_OAUTH=http://127.0.0.1:<puerto>` sustituye al proveedor por un servidor falso, guarda la clave como `ai.oauthtest` (nunca `ai.openrouter`), no abre navegador, registra la URL de autorización y bloquea todo `ai_fetch` para que no salga ninguna petición a proveedores reales. En compilaciones de producción no existe.

**Pruebas**: tests nuevos en `np-ai-proxy` (`tests/login_flow.rs`, servidor falso con wiremock que comprueba que `code_verifier` cuadra con el `code_challenge` de la URL; más `table.rs` y `login.rs`): flujo completo con comprobación de `state`, ruido ignorado (otro `state`, sin `state`, otro camino, otro `Host`), puerto cerrado tras el éxito (replay), código rechazado (403) sin guardar clave ni repetir el cuerpo, verificador distinto, caducidad con cierre del oyente, cancelación con cierre y nuevo intento (y `login_busy` si hay uno en curso), acceso denegado, respuesta sin clave, flujo no ejecutable. En la app real (build `target/verify`) contra el servidor falso en el puerto 4577: espera + cancelar, `state` erróneo ignorado, código malo → error y puerto cerrado, reintento → clave `ai.oauthtest` guardada y paso 3 alcanzado (la prueba de conexión falló «bloqueada», como estaba previsto), clave de prueba borrada al final; papel y tinta a 1440×900 y 800×600.

### 2. Revisión de la lista (criterios)

Se queda el proveedor que cumple: (a) salida estructurada JSON y herramientas para el agente, (b) buena comprensión de noticias en ES/DE/EN, (c) contexto ≥ 16k, (d) alcanzable por API compatible con OpenAI o adaptador nativo, (e) sigue existiendo, (f) nivel gratuito o precio razonable, (g) no es redundante.

| Proveedor | Decisión | Motivo | Fuente |
|---|---|---|---|
| Perplexity | **Eliminado** | Sonar está orientado a búsqueda con citas; en el catálogo de OpenRouter `sonar`, `sonar-pro` y `sonar-reasoning-pro` no declaran `tools` ni `structured_outputs` (solo `sonar-pro-search` admite salida estructurada); la app ya hace su propia búsqueda de coberturas | openrouter.ai/api/v1/models |
| OpenAI | Se queda (cerrado) | Ids antiguos (`gpt-5`) desfasados: ahora `gpt-6-sol` 2/10 $ y `gpt-6-luna` 0,10/0,50 $ por millón (en el catálogo con `tools` + `structured_outputs`, contexto 1 M) | developers.openai.com/api/docs/pricing; openrouter.ai/api/v1/models |
| Anthropic | Se queda (cerrado) | Sin cambios: ids y precios verificados (Opus 5.5 4/20, Sonnet 5.5 2/10, Haiku 5.5 0,10/0,50, 1 M de contexto) | platform.claude.com/docs/en/models/overview |
| Google Gemini | Se queda (cerrado, recomendado) | Modelos 2.5 desfasados. `gemini-3.8-flash` (0,75/3,75; con nivel gratuito) pasa a ser el «fuerte» por defecto para que una clave gratuita funcione; `gemini-3.5-flash-lite` (0,30/2,50) como ligero; `gemini-4-argon` (2/10, sin nivel gratuito) detrás. Aviso: el precio de 3.8 Flash sube a 1,50/7,50 $ el 1-1-2027 y el de Argon a 4/20 el 1-12-2026 (no se refleja hasta que ocurra) | ai.google.dev/gemini-api/docs/pricing |
| OpenRouter | Se queda (mixto, recomendado) | Único con login oficial; modelos `:free` con `tools` y `structured_outputs` (`nvidia/nemotron-3-super-120b-a12b:free`, 262k de contexto; `openrouter/free`, 200k). `openrouter/auto` mantiene precio `null` (dinámico) | openrouter.ai/docs; catálogo |
| Ollama | Se queda (abierto, local, recomendado) | Opción privada y gratuita; las bibliotecas `qwen3` y `llama3.1` existen; la detección usa los modelos instalados por la persona | ollama.com/library |
| LM Studio | Se queda (abierto, local) | Complemento local sin coste; sin cambios | - |
| Groq | Se queda (abierto) | `llama-3.3-70b-versatile` sigue en producción; se añaden `openai/gpt-oss-120b` (0,15/0,60) y `gpt-oss-20b` (0,075/0,30), contexto 131k. El precio de Llama pasa a `null` (la tabla de Groq dice «contactar»; los 0,59/0,79 anteriores eran de otro host). Límite gratuito muy bajo (8k tokens/min en gpt-oss-120b según la tabla): puede ahogar el análisis completo | console.groq.com/docs/models, /docs/rate-limits |
| NVIDIA NIM | Se queda (abierto) | Los ids anteriores siguen en `/v1/models` (`deepseek-ai/deepseek-v4.1-flash`, `nvidia/nemotron-3.5-lightning-30b-a3b`); `meta/llama-3.3-70b-instruct` ya no existe. Se añade `nvidia/nemotron-3-super-120b-a12b`. Precio `null` (créditos de prueba) | integrate.api.nvidia.com/v1/models |
| DeepSeek | Se queda (abierto) | `deepseek-chat`/`deepseek-reasoner` ya no aparecen en la documentación; ahora `deepseek-flash` y `deepseek-v4-pro` (1 M de contexto, JSON y herramientas). Precios de hora punta (0,3/1,2 y 1,32/3,96); fuera de punta cuestan la mitad | api-docs.deepseek.com/quick_start/pricing |
| Mistral | Se queda (abierto) | Proveedor europeo; los modelos actuales (Large 3/4, Small 4, Medium 3.5) son de pesos abiertos. **No verificado**: la página de modelos no publica alias de API ni precios; se mantienen `mistral-large-latest`/`mistral-small-latest` con precio `null` (el relevo de `liveModels.ts` cubre un 404) | docs.mistral.ai/getting-started/models/models_overview |
| Nous Research | Se queda (abierto) | Hermes 4 405B/70B siguen siendo los ids conocidos; precio `null` (los números que circulan son de terceros). Login: experimental, no disponible (ver arriba) | forum.nousresearch.com; docs.cline.bot |
| Hugging Face | Se queda (abierto) | Router OpenAI-compatible vigente; `meta-llama/Llama-3.3-70B-Instruct` no se pudo verificar y se sustituye por `openai/gpt-oss-120b` (ejemplo oficial). Créditos gratuitos mensuales pequeños; el token «fine-grained» con permiso de Inference Providers es más difícil para quien no es técnico | huggingface.co/docs/inference-providers |
| xAI | Se queda (cerrado) | `grok-4` → `grok-4.7` (2/6 $ hasta 200k, 500k de contexto; `structured_outputs` + `tools` en OpenRouter). Menos prioritario, pero aporta un cerrado alternativo | docs.x.ai/docs/models |
| Endpoint propio | Se queda (avanzado, mixto) | Cualquier servidor compatible | - |

El relevo dinámico (`liveModels.ts`, `GET /models`) no se tocó y sigue sirviendo a todos los proveedores `openai`/`openai-compatible`; Gemini y Anthropic usan adaptador nativo y se quedan con la lista del registro.

Límite de lo verificado: los precios de OpenAI y Google salen de las tablas oficiales y se contrastaron con el catálogo de OpenRouter; los de Nous, NVIDIA y Mistral se dejan en `null` en vez de adivinar.

### 3. Abiertos y cerrados

Nuevo campo `openness` (`open` | `closed` | `mixed`) en cada proveedor y `openness` opcional por modelo (`open` | `closed`, solo donde difiere del proveedor); `loadRegistry` expone `opennessOf(proveedor, modelo)` y un test comprueba que ningún modelo contradice a su proveedor.

- **Abiertos**: DeepSeek, Mistral, NVIDIA NIM, Groq, Hugging Face, Nous, Ollama, LM Studio (pesos descargables y ejecutables en casa).
- **Cerrados**: OpenAI, Anthropic, Google Gemini, xAI.
- **Mixtos**: OpenRouter (por modelo: Nemotron gratis = abierto, GPT-6 Luna = cerrado, Auto/Gratis = sin clasificar) y el endpoint propio.

Interfaz: el paso 1 del asistente muestra Recomendados, «Pega tu clave», **Abiertos**, **Cerrados**, **En tu equipo** y **Avanzado**; en Ajustes › IA los filtros son Todos / Activos / Abiertos / Cerrados / Local, y en «Todos» las fichas van agrupadas con el mismo criterio. Un proveedor mixto sale una vez (con los abiertos) y aparece con ambos filtros; el panel de OpenRouter marca cada modelo como «abierto/cerrado». Textos nuevos en es/en/de. El esquema de Rust no necesita el campo (solo la interfaz lo usa).

### 4. Recomendados

Se pasa de «categoría recomendada» a un booleano `recommended`; la categoría queda en `cloud | local | advanced`. Los tres elegidos para esta app (análisis de noticias con salida estructurada, ES primero, privacidad, sensibles al coste, sin perfil técnico):

1. **Gemini (cerrado)**: «Gratis para empezar, sin complicaciones». Clave gratuita en AI Studio, contexto de 1 M, salida estructurada y herramientas, buen español. Coste a cambio: en el nivel gratuito Google puede usar lo enviado para mejorar sus productos (términos de la API de Gemini, ai.google.dev/gemini-api/terms; con saldo de pago no); la tarjeta y la nota del paso 2 lo dicen.
2. **OpenRouter (mixto)**: «Entra con tu cuenta, sin copiar claves». Es el único con inicio de sesión real, ofrece modelos gratuitos con estructura y herramientas y cientos más de pago.
3. **Ollama (abierto, en tu equipo)**: «Privado: todo se queda en tu ordenador». Para quien prioriza privacidad y gasto cero; necesita un equipo con memoria suficiente.

Descartados como recomendados: OpenAI y Anthropic (clave de pago obligatoria y facturación aparte: no es lo más sencillo para empezar), Groq (límite gratuito demasiado bajo para el análisis completo) y NVIDIA/HF/Nous (claves menos sencillas).

`autoAssign` (`packages/pipeline/src/assign/presets.ts`): el desempate usa `recommended`; las listas están ordenadas para que el primer modelo «fuerte» de cada proveedor sea el que funciona sin saldo (Gemini 3.8 Flash antes que Argon; Nemotron gratis antes que `openrouter/auto`). `presets.test.ts` (nuevo) cubre Gemini solo, Gemini + Anthropic (juez B distinto), OpenRouter solo con el preset barato (todo gratis) y privacidad/respaldo local. Se actualizaron los ids de los tests existentes (`gpt-5` → `gpt-6-sol`, `gpt-5-mini` → `gpt-6-luna`, recomendados, ya sin Perplexity); ningún test se borró.

### Pendiente y no verificado

- Endpoints, `client_id` y uso de tokens del login de Nous (documentación incompleta): no hay login automático.
- Alias y precios de Mistral; precios de NVIDIA y de Nous (`null`).
- Que `127.0.0.1` valga como callback de OpenRouter (se usa `localhost`, lo documentado); el flujo real contra openrouter.ai no se ejecutó a propósito (sin logins reales).
- Que el oyente loopback sea alcanzable con el cortafuegos/antivirus de cada equipo (en Windows el tráfico loopback no suele pedir permiso, pero no se probó en todos).
- Cuota real de los niveles gratuitos de Gemini, Groq y OpenRouter (cambian a menudo; solo se leyeron las tablas públicas).
- Linux/macOS: el abridor del navegador (`xdg-open`/`open`) compila pero no se ejecutó.

## Simplificación de la conexión de proveedores y New Router

Fecha: 2026-10-15. El usuario (autor del mockup) pidió explícitamente **simplificar**: con 14 proveedores, grupos abiertos/cerrados, filtros, recomendados, inicio de sesión, local y avanzado, conectar un proveedor abrumaba a una persona no técnica. Por eso se **desvía del mockup** `Proveedores.dc.html` (y de `Ajustes.dc.html`) donde reduce carga cognitiva; se conservan tokens, tipografía, tarjetas y movimiento.

### Principio: divulgación progresiva

1. **Paso 1 del asistente** muestra solo: un título («Empieza con uno de estos»), los 3 recomendados (logo, nombre, una frase, «Conectar X»), «¿Ya tienes una clave? Pégala aquí» (reconoce el proveedor) y **un** enlace discreto «Ver todos los proveedores (13)».
2. Ese enlace abre una **subvista con «Volver»** (no se despliega en el sitio: así los tres recomendados no compiten con la lista): buscador, interruptor de tres posiciones **Abiertos / Cerrados / En tu equipo** con una línea que explica el elegido, y filas compactas (logo, nombre, una frase, etiquetas Gratis / Con cuenta / Local, flecha). Al final, una fila de texto «¿Tienes tu propio servidor? Conéctalo» (el endpoint propio; la palabra «endpoint» ya no sale en las primeras vistas).
3. **Ajustes › IA**: la primera vista es «Tus proveedores» (los conectados o detectados, con «Añadir proveedor» que abre el mismo asistente), «Punto de partida» (cuatro opciones en una fila + una línea + coste, tiempo y pasos en tu equipo) y el límite de gasto. La cuadrícula de proveedores y el inspector de 8 pasos pasan a **«Avanzado»**, plegado por defecto. Sin proveedores solo se ve «Conecta un proveedor» y «Avanzado».

### Antes y después

Medido en la app real (build `custom-protocol`, papel y tinta, 1440×900 y 800×600; sin desbordamiento horizontal en ninguna combinación). Elementos interactivos visibles: botones habilitados, enlaces, campos y deslizador (los pasos del indicador no lo son).

| Vista | Antes | Después |
|---|---|---|
| Asistente, paso 1 | 19 | **6** (3 recomendados, campo de clave, «Ver todos», cerrar) |
| Asistente, lista completa | — | 14 elementos, **6 paradas de tabulador** (volver, buscador, interruptor, lista, servidor propio, cerrar) |
| Ajustes › IA, primera vista (2 conectados) | 39 | **9** (2 proveedores, «Añadir», 4 opciones de punto de partida, límite, «Avanzado»); 6 paradas de tabulador |
| Ajustes › IA, «Avanzado» abierto | 39 | 37 (se quitaron los 5 filtros y el botón del asistente) |
| Ajustes › IA, sin proveedores | 39 (15 fichas + presets + límite) | **2** («Conectar un proveedor», «Avanzado») |

Aparte, el paso 1 pasa de ~6 bloques (recomendados con descripción larga, clave, Abiertos, Cerrados, En tu equipo, Avanzado) a 3 (recomendados, clave, enlace).

### Teclado y foco

Al abrir la lista el foco va al buscador; Tab recorre volver → buscador → interruptor → lista → servidor propio; en el interruptor, flechas izquierda/derecha; en la lista, flechas arriba/abajo, Inicio y Fin (un solo tabulador para toda la lista, «roving tabindex»); flecha arriba desde la primera fila vuelve al buscador. **Escape = un nivel atrás**: vacía la búsqueda si tiene texto, vuelve a «Elegir» (y el foco regresa a «Ver todos»), luego cierra el asistente; desde el paso 2 vuelve a la lista. El punto de partida de Ajustes es un interruptor de radio con flechas. Comprobado con eventos de teclado reales por CDP.

### New Router

Ver `2026-10-15-new-router-idea.md`. Va en una lista `roadmap` de `config/providers.json` (no en `providers`), de modo que no puede entrar en `autoAssign`, en la tabla del proxy de Rust, en los modelos en vivo ni en «conectados» (probado en `registry.test.ts` y en `table.rs`). Fila atenuada de trazo discontinuo con «Próximamente» y botón desactivado al principio de la lista completa; no está en la primera vista. Sin red, sin estado falso, sin «Avísame».

### Desviaciones respecto al mockup

- Paso 1: se quita la descripción larga de las tarjetas recomendadas (la advertencia de privacidad de Gemini sigue en el paso 2, `tip.google`), la etiqueta «Recomendado» (el título ya lo dice) y el texto de ayuda bajo «Pega tu clave». Las cuadrículas «Abiertos», «Cerrados», «En tu equipo» y «Avanzado» pasan a la subvista de lista; los grupos son ahora un interruptor, no secciones apiladas.
- La lista usa filas, no fichas, y frases nuevas en lenguaje llano (`providers.hint.*`) en lugar de «V4, pesos abiertos», «build.nvidia.com», etc.
- Con texto en el buscador se busca en **todos** los grupos (el interruptor se atenúa): quien escribe «claude» estando en «Abiertos» no ve una lista vacía.
- Etiquetas nuevas: «Gratis» (campo `freeTier` del registro: Gemini, OpenRouter, Groq y Hugging Face, los que la revisión anterior documenta con cuota o créditos gratuitos), «Con cuenta» (hay inicio de sesión disponible: hoy solo OpenRouter) y «Local».
- Ajustes › IA: los cuatro presets de tarjeta grande pasan a un interruptor de una fila con la descripción debajo; se quitan los filtros Todos/Activos/Abiertos/Cerrados/Local (redundantes con los grupos y con «Tus proveedores»); la cuadrícula de 15 fichas, su panel y el pipeline de 8 pasos con el inspector y el resumen oscuro van en «Avanzado». El resumen de la primera vista es una fila de tres cifras (coste por noticia, tiempo, pasos en tu equipo), sin franjas de color.
- Menos palabras: se acortan el subtítulo de Ajustes y el texto del estado vacío; «endpoint» y «adaptador» ya no salen en las primeras vistas (siguen en «Avanzado» y en el paso 2 del servidor propio, que no se tocó).
- Pasos 2 y 3: sin cambios salvo el espacio del indicador de pasos (30/34 → 24/28 px) para que coincida con la subvista.

### Verificación y límites

- `window.__TAURI_INTERNALS__.invoke` es de solo lectura, así que un guardián de JavaScript no puede interceptar llamadas: las comprobaciones se hicieron con el gancho de OAuth falso activo (`NP_TEST_OAUTH`, que bloquea el tráfico a proveedores) y sin llamar a ninguno. Para capturar el estado vacío se puso `ai.connected` a `[]` en la app y se restauró (`["nvidia","ollama","openrouter"]`, comprobado); las claves del llavero no se tocaron.
- Pruebas nuevas: `chooser.test.ts` (segmentos, búsqueda sin acentos ni mayúsculas en todos los grupos, etiquetas), `registry.test.ts` (el `roadmap` no es proveedor ni se asigna; registros antiguos sin `roadmap` cargan; id repetido o estado desconocido se rechazan; `freeTier`) y `table.rs` (`roadmap` no crea una `ProviderSpec`).

### Pendiente

- Revisión humana de las frases nuevas en alemán e inglés.
- «Gratis» se basa en lo documentado en la revisión anterior (las cuotas gratuitas cambian a menudo).
- La fila «Próximamente» está al principio de la lista completa; si se prefiere al final o en la primera vista, es un cambio de una línea.
