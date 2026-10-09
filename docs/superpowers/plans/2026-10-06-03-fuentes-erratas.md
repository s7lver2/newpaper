# Erratas del plan 03 (fuentes)

Registro de errores encontrados al ejecutar el plan y cómo se corrigieron. Las correcciones ya están aplicadas en el código; el texto del plan no se ha reescrito.

| Tarea | Error | Corrección | Commit |
|---|---|---|---|
| 10 | `RequestBuilder::query` no existe con las features de `reqwest` del workspace (E0599) | Feature `query` añadida a `reqwest` en `np-feeds/Cargo.toml` | 6d124ba |
| 10 | El plan dice “el test de Exa lo comprueba” en la nota de la marca temporal, pero no define ese test | No se añade test: la búsqueda de respaldo no es una pieza de núcleo según la política de tests; la nota queda como comentario | 6d124ba |
| 13 | `split_turns`: la condición de acotaciones tenía un paréntesis sin cerrar (“mismatched closing delimiter”) | Paréntesis corregido | 9a769ff |
| 14 | El paso 5 (construir el léxico español real) descarga el Diario de Sesiones y la lista de diputados desde la red | No ejecutado (regla del usuario: sin corpus ni red). `config/lexicon-{es,en,de}.json` quedan en `pending` con `phrases: []`; en `en`/`de` `legislature` va vacío y `source` lleva el nombre del parlamento | adbf353 |
| 16 | `ParagraphDiff.kind` se declaró `Option<EditKind>`, pero `diff_texts` y el test lo tratan como `EditKind` (E0308) | Campo `kind: EditKind` | 1a9f9a2 |
| 18 | `sources/mod.rs` y `sources/commands.rs` usan `rusqlite` sin tenerlo declarado en `np-app` (E0433) | `rusqlite = { workspace = true }` en `src-tauri/Cargo.toml` | ebed173 |
| 20 | El test `builds_an_edition_and_lists_it` espera `bytes == 2048`, pero `add_article` suma también el tamaño del JSON del artículo (18 bytes) | Aserción `2048 + len(article_json)`; la contabilidad de bytes queda documentada en el código | fdce576 |
| 22–23 | El plan sustituye `rewriteImage` por una versión de un solo argumento; se pierde el parámetro `pageUrl` que añade `?r=` (Referer) en el lector existente | Se conserva la firma existente y solo se añade el paso directo de `http://npoffline.localhost/` | d9c41cc |
| 25 | El paso 5 (comprobación de feeds contra la red) y el paso 6 (prueba E2E con datos reales) no se ejecutan por la regla del usuario | Pendiente: `node scripts/check-feeds.mjs config/sources-{es,en,de}.json` cuando haya red; las URL de feed no están verificadas | 9a68d40 |
| 25 | `config/sources-es.json` ya existía como semilla del subproyecto 1 | Sustituida por la del plan (34 medios, mismo formato) | 9a68d40 |
