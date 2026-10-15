# New Router (idea, planificada)

Estado: **solo una idea**. No hay producto, servidor ni cuenta detrás. Esta nota recoge lo que se dijo y cómo se refleja hoy en la interfaz; todo lo demás está abierto.

## Qué es (tal como lo describió el usuario)

«New Router» sería **nuestro propio router** (pasarela) de modelos: una sola cuenta para todos los modelos, sin claves. Se ofrecerá más adelante.

No se ha dicho nada más: ni quién lo opera, ni qué modelos, ni precios.

## Cómo se representa ahora

- `config/providers.json` tiene una lista aparte, `roadmap`, con `{ "id": "newrouter", "name": "New Router", "status": "planned" }`. Está **fuera** de `providers` a propósito: sin URL, adaptador, modelos ni claves, no puede entrar en la asignación automática (`autoAssign`), en la tabla del proxy de Rust (`ProviderTable`), en la lista de modelos en vivo ni en «proveedores conectados».
- `loadRegistry` expone `registry.roadmap` (valor por defecto `[]`, para registros anteriores) y rechaza una entrada de `roadmap` cuyo id choque con un proveedor. Pruebas: `registry.test.ts` (exclusión) y `table.rs` (`roadmap_entries_never_become_provider_specs`).
- Interfaz: una fila **atenuada, de trazo discontinuo, con la etiqueta «Próximamente»** y un botón desactivado, al principio de «Todos los proveedores» (la lista que abre «Ver todos los proveedores» en el asistente). No está entre los tres recomendados ni en Ajustes. No hace ninguna petición de red, no muestra ningún estado inventado y no recoge ningún dato (no hay «Avísame»).
- Texto: «Nuestro propio router: una sola cuenta para todos los modelos, sin claves» (es/en/de, `providers.soon.newrouter`). Logo: marca de un trazo (un nodo que se reparte en tres) en `features/providers/logos/newrouter.svg`.

## Preguntas abiertas (por decidir más adelante)

- **Cuentas**: ¿cómo se crea y se identifica una cuenta sin pedir más datos de los necesarios? ¿Encaja con el inicio de sesión del navegador que ya existe para OpenRouter, o es otro flujo?
- **Facturación**: ¿prepago, suscripción o por uso? ¿Quién cobra y en qué moneda? ¿Cómo se refleja en el límite mensual y en las estimaciones de coste de la aplicación?
- **Privacidad**: ¿qué ve el router de cada petición (textos de las noticias, metadatos, IP)? ¿Se guarda algo y cuánto tiempo? ¿Qué se promete y cómo se puede comprobar?
- **Modelos**: ¿cuáles se ofrecen, abiertos o cerrados, quién los elige y cómo se actualiza el catálogo? ¿Cómo encaja con las etiquetas abiertos/cerrados y con `autoAssign`?
- **Relación con Tor y el modelo de privacidad**: ¿se llega al router a través de Tor como el resto del tráfico? ¿Es compatible con «sin cuenta, sin rastro» o rompe esa promesa al exigir una cuenta?
- **Sin claves**: ¿qué reemplaza a la clave (token de sesión, credencial en el llavero)? ¿Cómo se revoca?
- **Disponibilidad y límites**: ¿qué pasa si el servicio cae o si la persona llega a su límite? ¿Hay respaldo en otros proveedores?
- **Cuándo y cómo se activa**: cuando exista, pasaría de `roadmap` a `providers` (con su URL, esquema de autenticación y modelos) y a la tabla del proxy de Rust, con revisión de seguridad propia.
