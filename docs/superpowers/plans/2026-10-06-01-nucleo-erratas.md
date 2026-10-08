# Erratas del plan 01 (núcleo)

Registro de errores encontrados al ejecutar el plan y cómo se corrigieron. Las correcciones ya están aplicadas en el plan y en el código.

| Tarea | Error | Corrección | Commit |
|---|---|---|---|
| 2 | `packages/i18n/package.json` estaba guardado como `packages.json` (error de ejecución) | Renombrado a `package.json` | 7c8d65f y siguientes |
| 2 | `formatNumber` usaba `useGrouping: 'min2'` para todos los idiomas: en inglés salía `1234.5` en lugar de `1,234.5` | Se usa el formato por defecto de `Intl` (`new Intl.NumberFormat(tag, options)`) | — |
| 2 | `typescript@7.0.2` es el compilador nativo en Go y no expone la API de JavaScript (`ts.createSourceFile`) que usa `checks.ts` | `typescript@5.9.3` solo en `@newpaper/i18n` (el root sigue en 7 para `tsc`) | — |
| 2 | Falta `@types/node`, y `tsconfig.base.json` limita `types` a `vitest/globals` | Añadidos `@types/node@^22` y `"types": ["vitest/globals", "node"]` en el tsconfig de i18n | — |
| 3 | `repo.test.ts` usaba `new URL(..., import.meta.url)` con `environment: jsdom`: la URL es `http:` y `fileURLToPath` falla | `// @vitest-environment node` al inicio del archivo | — |
| 5 | `theme.test.ts` mezclaba tests de DOM (jsdom) con lectura de CSS (`import.meta.url`) | Los tests de CSS se movieron, sin cambios, a `src/tokens.test.ts` con `// @vitest-environment node` | 75b455a |
| 5 | `src/test/setup.ts` usa `window` y `Element` al cargar, y falla en entorno `node` | Preparación de DOM envuelta en `if (typeof window !== 'undefined')` | 75b455a |

## Pendiente

- **Plan 01, `DefaultReader` (tarea de la UI del lector):** pasa `page.article` (un booleano) a `ReaderView`. El plan 05 sustituye ese componente, pero el código del plan 01 sigue con el error. Se corregirá al llegar a esa tarea.

## Notas de entorno

- Git avisa de `CRLF will be replaced by LF` en los archivos de Windows. No afecta a los tests; es configuración de `core.autocrlf` en esta máquina.
