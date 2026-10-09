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
| 10 | El test de `ConsentDialog` usa `rerender` sin el `I18nProvider` (`useI18n must be used inside <I18nProvider>`) | Los `rerender` envuelven el componente en `I18nProvider` (la nota del plan ya lo prevenía) | (ver commit de la tarea 10) |
| 14 | `startAutoAnalysis()` se llama al importar `features` y rechaza sin el puente de Tauri (`transformCallback`): error no capturado en los tests de `App` | `.catch(() => undefined)` en el registro: sin puente no hay análisis automático, pero no se rompe el arranque | 28fe61c |
| 15 | Mismo `SegmentedControl` con `setState` como `onChange` que en la tarea 9 (TS2322) | Cast a `View` | d0f4e5f |
