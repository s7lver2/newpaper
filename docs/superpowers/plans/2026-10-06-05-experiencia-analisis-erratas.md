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
| Ajustes | El asistente de proveedores se pintaba dentro del Ajustes con barra lateral | Página completa para subpasos de Ajustes | pendiente de commit final |
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
- Proveedores (asistente) y Ajustes › IA: ahora a página completa con tarjetas grandes, pero sin pasos con indicador, logos de proveedor ni la cuadrícula de 13 proveedores / tarjetas de preset del mockup; la sección «IA» y «Análisis» de la barra lateral no tienen icono ni resumen.
- Historial: sin columna lateral (conservar, pausar, sincronización), iconos de medio ni pestañas con contadores.
- Gráficos de la síntesis: marco y escala corregidos, pero sin selector Barras/Línea/Tabla en la tarjeta, valor destacado ni barra rayada del dato provisional; la matriz no usa chips de color.
- Nueva pestaña: sin la tarjeta «Continúa leyendo» con progreso ni el pie de página.
- No se ha probado `useUnderlay` con la vista original visible (solo lector, donde la webview nativa está oculta) ni el atajo Ctrl+K sobre la webview nativa; sí funcionan el botón de la barra y la selección en el lector.
- e2e: especificación actualizada a los nuevos selectores; sigue sin ejecutarse.
