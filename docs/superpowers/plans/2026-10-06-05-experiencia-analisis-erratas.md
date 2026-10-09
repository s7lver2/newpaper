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
