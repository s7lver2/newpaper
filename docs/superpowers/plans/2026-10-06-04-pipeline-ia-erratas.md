# Erratas del plan 04 (pipeline de IA)

Registro de errores encontrados al ejecutar el plan y cómo se corrigieron. Las correcciones ya están aplicadas en el código.

| Tarea | Error | Corrección | Commit |
|---|---|---|---|
| 3 | `ai::setup` usaba `?` sobre `read_config_text("providers.json")`: sin ese fichero la app no arranca (el fichero llega en la Tarea 4) | Si falta o no valida, se usa una tabla vacía y se registra un aviso; la IA queda sin proveedores (estado vacío en la UI) | 8084018 |
| 4 | `pnpm install` falla con `ERR_PNPM_IGNORED_BUILDS` (esbuild, edgedriver, geckodriver) en pnpm 12 | Instalación con `pnpm install --ignore-scripts` (esbuild funciona sin su postinstall). No se aprueban scripts de drivers de navegador | 80bb6d6 |
| 4 | El test de registro usa `import.meta.url` con `environment: jsdom` (la URL es `http:`, falla con "The URL must be of scheme file") y `node:fs` sin tipos | `// @vitest-environment node` en el test; `@types/node` 22.20.5 (ya en el lockfile) y `"types": ["vitest/globals", "node"]` en el tsconfig del paquete | 80bb6d6 |
| 4 | Los logos citados (`openai.svg`, `nous.svg`…) no existen en el repositorio | Se conserva el campo `logo` como dato; la UI del subproyecto 5 debe usar un fallback. Pendiente | 80bb6d6 |
| 4 | Precios y endpoints "verificados a 2026-10-08" no se han comprobado en línea en esta ejecución | Se dejan tal cual y se marcan como pendientes de revisión (el plan ya pide revisarlos al implementar) | 80bb6d6 |
| 9 | `cost.test.ts` usa `import.meta.url` con jsdom (mismo fallo que T4) | `// @vitest-environment node` | 3d97295 |
| 12 | El tipo `Article` de `@newpaper/extract` exige `limited: boolean`; el objeto simulado del test no lo incluye y `tsc` falla | Se añade `limited: false` al fixture | dc18c85 |
| 14 | Con `half = 8 + 40·(1−c) + 20·dispersión` el primer test (señales fuertes y coherentes) da un intervalo de 44,3 puntos (> 40) y `no_determinable`, contradiciendo su propio test | `half = 6 + 25·(1−c) + 15·dispersión`. El criterio de ancho máximo de 40 puntos y el de confianza mínima siguen igual | f15ff10 |
| 20 | `pipeline.test.ts` usa `import.meta.url` con jsdom | `// @vitest-environment node` | 0bf59cc |
| 20 | `mediaOf` (verify) usa `DOMParser`; sin DOM (entorno node de test) lanza y `retrieveSources` descarta la fuente en silencio, de modo que los veredictos no citan nada | Guarda `typeof DOMParser === 'undefined'` → sin medios. En WebView2 el DOM siempre existe | 0bf59cc |
| 21 | El tipo TS `CustomEndpoint` del plan (`{id, name, baseUrl, models}`) no coincide con el `CustomEndpoint` de Rust (`{id, baseUrl, auth, local}`): `ai_set_endpoints` fallaría al deserializar | El tipo TS sigue la forma de Rust (camelCase) | cdf12de |
| 3 | Verificado sin cambios: la clave del llavero `ai.custom:<slug>` no es válida (`validate_secret_key` solo admite `[a-z0-9._-]`) | `secret_key()` sustituye `:` por `-` (`ai.custom-<slug>`), como ya indicaba el plan | 7f8d2e8 |
