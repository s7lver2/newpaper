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

## Revisión independiente: seguridad, spec y regresión visual

Revisión hecha con modelos simulados y servidores locales; no se llamó a ningún proveedor real ni se tocó el llavero.

| Área | Hallazgo | Corrección | Commit |
|---|---|---|---|
| Seguridad (alta) | El cliente HTTP compartido sigue redirecciones: reqwest solo retira `Authorization` al cambiar de host, no `x-api-key` ni `x-goog-api-key`. Un 3xx del proveedor (o de un endpoint personalizado) filtraba la clave | `ai_fetch` y `source_fetch` usan un cliente sin redirecciones (`HttpClientProvider::client_strict`, `NetController::http_client_strict`, mismo enrutado Tor/directo). La clave se marca como cabecera sensible | 4ef82ad |
| Seguridad (alta) | `source_fetch` aceptaba cualquier URL de `allowExtra` (venida de JS): `http://169.254.169.254/`, `localhost`, IPs privadas, `user:pw@`; seguía redirecciones sin revalidar | `guard::is_private_host` (IPv4/IPv6 privadas, mapeadas, enteras/hex, CGNAT, `.local/.internal`), sin userinfo, redirecciones manuales (máx. 5) revalidadas salto a salto | 4ef82ad |
| Seguridad (media) | `fetch_source` leía el cuerpo entero antes de comprobar el tamaño, sin límite de tiempo ni de tipo | Lectura en streaming con tope de 4 MB, plazo total de 30 s, solo `text/*`, XML y JSON | 4ef82ad |
| Seguridad (media) | Proxy de IA sin tope de respuesta ni plazo, `request_id` duplicado pisaba el `AbortHandle` (petición no cancelable) y, con el canal cerrado, la descarga seguía | Tope 64 MB, plazo 10 min, id duplicado rechazado (`duplicate_request`), `execute_live` corta si el canal se cierra | 4ef82ad |
| Seguridad (baja) | JS podía fijar cabeceras de credencial no listadas (`x-auth-token`, `x-amz-security-token`…) | Se descarta toda cabecera cuyo nombre contenga auth/api-key/token/secret/cookie/credential/password/signature | 4ef82ad |
| Seguridad (baja) | Un endpoint personalizado "remoto" podía apuntar a `127.0.0.1`/`169.254.169.254`/hosts internos | Solo los marcados `local` pueden hacerlo; los remotos exigen https y host público | 4ef82ad |
| Inyección | Los títulos de páginas ajenas iban sin sanear en el prompt de sistema del agente y el texto de `fetchSource` volvía sin delimitar | Título a una línea, 140 caracteres, sin marcadores; texto devuelto con `delimit` (nonce) | 4ef82ad |
| Transporte | `new Response(stream, {status: 204/205/304})` lanza `TypeError` | Cuerpo nulo en esos estados | 4ef82ad |
| Validación de URL | Probado: userinfo, `\@`, host con sufijo, punto final, `%2e%2e`, prefijo `/v1evil`, relativas y `//host` se rechazan; la clave de un proveedor solo viaja a su host; `ai.<id>` / `ai.custom-<slug>` | Tests añadidos a `table.rs`, `headers.rs`, `guard.rs`, `sources.rs` (sin cambios de lógica) | 4ef82ad |
| Capabilities | Solo `capabilities/ui.json` (webview `ui`) lista los comandos `ai_*`; no hay `secret_get`; en la app real `secret_get` responde "Command not found" | Sin cambios | - |
| Claves en logs/caché | Sin `tracing` que toque claves ni `Debug` con claves; `analyses` y `usage` solo guardan JSON de etapa, modelo y coste | Sin cambios | - |
| Arranque | Con `providers.json` corrupto la app arranca, `usage_month` responde y los ajustes cargan; la IA queda sin proveedores (registro vacío en JS, etapas omitidas) | Sin cambios | - |
| Regresión visual | Inicio, ajustes (red, bloqueo, general, fuentes, sin conexión, datos), popup de Tor, lector con `noticia.html` y página de error en papel y tinta: sin desbordes (`scrollWidth == innerWidth`) ni errores de consola, salvo los 400 esperados de `npimg` para imágenes en 127.0.0.1 (protección local, solo se permiten con `NP_TEST_ALLOW_LOCAL_IMAGES`) | Sin cambios | - |
| UI de IA | El plan 04 no añade ninguna sección de IA/proveedores ni el estado vacío "Conecta un proveedor"; no se construye (plan 05, mockup `Proveedores.dc.html`) | Anotado | - |

### Conformidad con el spec (§5, §5.2.1, costes)

Cumple (por lectura y tests con modelos simulados): 8 etapas con esquemas zod; idioma de salida como parámetro (`languageInstruction`); anonimizado antes de puntuar; posición relativa al grupo de coberturas (`groupCenter`, `mode: relative`); léxico + juez LLM con evidencia literal validada; omisiones solo si aparecen en otro documento; `no_determinable` por confianza, anchura del intervalo o menos de 2 señales; intervalo y confianza por puntuación; comparación entre modelos (`judgeB`, `crossModelDisagreement`); costes estimados por etapa y límite mensual con paso a locales; caché SHA-256 `url + texto` a 30 días; detector de texto IA con señales heurísticas sin modelo; hecho sin cobertura con `acknowledged: true` obligatorio; agente con herramientas validadas por zod y citas `[n]` limpiadas contra fuentes recuperadas; aislamiento de fallos por etapa; análisis rápido (solo `quickScore`) frente al completo.

No cumple o con matices (anotados, no corregidos por ser mayores o de diseño):
- La caché por `hash(url + texto)` no incluye idioma de salida ni modelo: al cambiar de idioma se sirven etapas en el idioma anterior hasta que caducan. Cambiar la clave rompería `np-feeds/stats.rs`, que filtra por `stage IN ('score','verify')`.
- El presupuesto mensual se evalúa al empezar cada análisis (no entre etapas) y los modelos sin precio (`price: null`) cuentan 0 USD.
- La prueba de espejo (`mirrorCheck`) y el error por bloque (`blocError`) existen como utilidades, pero no están conectadas a ninguna pantalla ni a la CI.
- Las citas del agente se limpian por número de fuente recuperada; no se comprueba que la frase citada aparezca literalmente en la fuente.
- La confirmación obligatoria antes de investigar se exige en el tipo y en tiempo de ejecución, pero el diálogo es de la UI del plan 05.

### No verificables

- Comportamiento real de los proveedores (formatos, precios y endpoints de `providers.json` "a 2026-10-08") y de Ollama/LM Studio.
- Kill switch de Tor para tráfico de IA/fuentes: se confía en que el servidor SOCKS local rechaza sin circuito (subproyecto 2); no se probó con Tor real (`NP_FAKE_TOR=1`).
- Resolución DNS hacia redes privadas (rebinding) para URLs explícitas de fuentes: solo se bloquean IPs literales y nombres internos, porque resolver localmente filtraría DNS en modo Tor.
- Credenciales reales en el llavero de Windows (no se escribió en él).
