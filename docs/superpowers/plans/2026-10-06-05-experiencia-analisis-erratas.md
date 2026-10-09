# Erratas del plan 05 (experiencia de análisis)

Registro de errores y desviaciones encontrados al ejecutar el plan y cómo se corrigieron.

| Tarea | Error o desviación | Corrección | Commit |
|---|---|---|---|
| 1 | El armazón del plan no contempla que `main` ya contiene `PageTransition`, `NativeUnderlay` y `ContextMenuHost` | Se mantienen dentro de `main`; el hueco lateral se añade como hermano dentro de `.np-workspace` | de58f1e |
| 6 | El plan pasa `rewriteImage` directamente a `ReaderView`, lo que pierde el Referer (`?r=`) que usa el lector por defecto | Se envuelve como `rewriteImage(abs, page.url)` (igual que `ArticleReader`) | 365556d |
| 8 | `VisualizationView` (mapa) usa `map ?? table`, pero un elemento JSX nunca es nulo: el fallback a tabla con códigos desconocidos no se llegaría a usar | La decisión se toma con `gridFor(codes) !== null` antes de montar el mapa | 64fcc49 |
| 8 | `@newpaper/pipeline` se usa solo para tipos desde ui-kit y el plan no lo declara en `package.json` de forma explícita | Se añade como `peerDependencies` y `devDependencies` (`workspace:*`) y se actualiza `pnpm-lock.yaml` | 64fcc49 |
| 2 | El plan pide `pnpm --filter @newpaper/i18n test` y los textos deben coincidir en los tres idiomas: el fragmento de `settings` se fusiona a mano en el JSON (sin reformatear) | Fusión por script a nivel de objeto JSON; los ficheros mantienen su formato | 6f3ce77 |
