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
| 7 | `extract.test.ts` leía las fixtures con `readFileSync(new URL(..., import.meta.url))` bajo `jsdom` (necesario para `DOMParser`): mismo fallo de URL no `file:` | Las fixtures se importan con `?raw` de Vite; el tsconfig del paquete añade `"vite/client"` a `types` | — |
| 8 | `message.test.ts` y el test de `dist/content.js` usaban `readFileSync(new URL(..., import.meta.url))` bajo `jsdom` | Fixture con `?raw`; el bundle se lee con `import.meta.glob` (no falla si `dist/` aún no existe) |  — |
| 5 | `packages/ui-kit/tsconfig.json` no incluye los tipos de Node, y `tokens.test.ts` usa `node:fs` | `"types": ["vitest/globals", "node"]` en el tsconfig de ui-kit | — |
| 6 | `components.test.tsx` pasaba el setter de `useState` a `onChange(v: string)`: no compila en typecheck | Callback con cast al tipo de la unión (`(next) => setV(next as "a" | "b" | "c")`) | — |
| 9 | El paso 5 decía “3 ficheros” de test; con `tokens.test.ts` separado son 4 | Corregido el texto a 4 ficheros (16 tests, sin cambio) | — |
| 10 | Al poner la implementación “encima de los tests”, las líneas `//!` del bloque de tests quedan a mitad de fichero y Rust no compila (E0753) | Las líneas `//!` se mueven al principio del fichero (`migrations.rs`) | — |
| 11 | Mismo problema de `//!` que en la tarea 10 al poner la implementación encima de los tests (`hlc.rs`, `ids.rs`) | Las líneas `//!` se mueven al principio del fichero | — |
| 12 | (a) Mismo problema de `//!` que en las tareas 10 y 11 (`settings.rs`). (b) `Store.observers` se declaró privado, pero `settings.rs` lo usa desde otro módulo (E0616) | (a) `//!` al principio del fichero. (b) campo `pub(crate) observers` | — |
| 13 | Mismo problema de `//!` que en las tareas 10–12 (`secrets.rs`) | Las líneas `//!` se mueven al principio del fichero | — |
| 14 | Mismo problema de `//!` que en las tareas 10–13 (`history.rs`) | Las líneas `//!` se mueven al principio del fichero | — |
| 15 | Mismo problema de `//!` que en las tareas 10–14 (`model.rs`, `input.rs`) | Las líneas `//!` se mueven al principio del fichero | — |
| 16 | Mismo problema de `//!` que en las tareas 10–15 (`message.rs`, `news.rs`) | Las líneas `//!` se mueven al principio del fichero | — |
| 17 | Mismo problema de `//!` que en las tareas 10–16 (`extensions.rs`) | Las líneas `//!` se mueven al principio del fichero | — |
| 18 | Mismo problema de `//!` que en las tareas anteriores (`host/mod.rs`, `host/win.rs`). `cargo check` de WebView2 compila sin cambios adicionales | Las líneas `//!` se mueven al principio del fichero | — |

## Pendiente

- **Plan 01, `DefaultReader` (tarea de la UI del lector):** pasa `page.article` (un booleano) a `ReaderView`. El plan 05 sustituye ese componente, pero el código del plan 01 sigue con el error. Se corregirá al llegar a esa tarea.

## Notas de entorno

- Git avisa de `CRLF will be replaced by LF` en los archivos de Windows. No afecta a los tests; es configuración de `core.autocrlf` en esta máquina.
