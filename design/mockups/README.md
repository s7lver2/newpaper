# Mockups de newpaper (pizarra de diseño)

Copia completa, versionada en el repo, de la pizarra "newpaper — mockups UI" (Artifact de tipo *Design*, id `ccd8eabe-6131-4ac1-8ea7-da631fc4551d`, exportada el 2026-10-09). Sirve para ver, comparar y reconstruir los mockups en otro ordenador o en otra sesión de Claude Code sin acceso a la pizarra original.

## Contenido

```
design/mockups/
  project/            35 artboards (*.dc.html) + canvas.json (índice: posición, tamaño, título, notas, orden)
  assets/             14 SVG subidos a la pizarra (<id>.svg) + manifest.json (id, sha256, qué artboards los usan)
  runtime/support.js  runtime x-dc (el `./support.js` que cargan los .dc.html; viene de artifact-type/dc-runtime.js)
  reference/          formato de los .dc.html (format.md) y las instrucciones del tipo Design (design-type-SKILL.md)
  serve.mjs           servidor local para verlos
  tools/rewrite-blobs.mjs  reescribe las referencias /_blob/<id> al republicar en una pizarra nueva
```

Pantallas (título de `canvas.json`): 1 Navegador/análisis/agente (`Main`), 2 Síntesis, 3 Sin cobertura, 3b Hemeroteca, 4 Nueva pestaña (`Inicio`), 5 Ajustes, S1 404, S2 Errores de conexión, S3 Cuelgue, S4 Tres en raya, P1 Instalador, P2 Recorrido, M0–M10 móvil, N1–N7 novedades (proveedores, agente visual, posición, historial, sincronizar, edición sin conexión, idioma y actualizaciones) y M11–M15 móvil.

## Verlos en local (sin cuenta ni red salvo Google Fonts)

```bash
node design/mockups/serve.mjs          # http://127.0.0.1:5601/  (puerto opcional: node ... 5602)
```

Abre `http://127.0.0.1:5601/` para el índice, o directamente `http://127.0.0.1:5601/Main.dc.html`. El servidor sirve `runtime/support.js` como `./support.js` y `/_blob/<id>` desde `assets/`. Los artboards son interactivos (pestañas, botones, animaciones). Para medir estilos exactos usa `getComputedStyle`/`getBoundingClientRect` en el navegador; son la referencia de fidelidad de la UI (tokens, tipografías Newsreader / IBM Plex, animaciones).

Tema: los mockups están en tema **papel**. El tema **tinta** no está dibujado: sale de los tokens de `packages/ui-kit/src/tokens.css`.

## Reconstruir la pizarra en otra sesión de Claude Code

Solo hace falta si se quiere editar los mockups en el editor de pizarras. Para consultar no hace falta (basta `serve.mjs`).

1. Pide una pizarra nueva con el tool `Artifact`: `action: "quickstart"`, `intent: "design"`, `design_systems: false`; luego publica con el `type_url` del tipo *Design* y un `title` (p. ej. "newpaper — mockups UI"). El resultado indica la `url` de la nueva pizarra y sus reglas (`project/canvas.json` es el índice; un `project/<nombre>.dc.html` por artboard; los archivos se publican con `root`, `file_path` y `files`).
2. Sube los SVG de `assets/` como recursos de la pizarra (`action: "publish"`, `url`, `asset: true`, `file_paths: [...]`; la pizarra declara la capacidad `assets`). Cada subida devuelve una URL `/_blob/<id nuevo>`. Solo tres SVG están referenciados por los artboards (ver `assets/manifest.json`, campo `referencedBy`): `ba377cf2…` (AgenteVisual, Posicion), `a3e89b95…` (Posicion), `a5ba8386…` (Movil-Proveedor); el resto son sobrantes.
3. Crea un `mapping.json` `{"<id viejo>": "/_blob/<id nuevo>"}` con esos tres y ejecuta:
   ```bash
   node design/mockups/tools/rewrite-blobs.mjs mapping.json /ruta/a/salida
   ```
   El script copia todo `project/` (artboards y `canvas.json`) a `/ruta/a/salida/project/` con las referencias de assets ya actualizadas.
4. Publica en la pizarra nueva el índice y los artboards en una sola llamada (`root: "/ruta/a/salida"`, `file_path` el `canvas.json` absoluto y el resto en `files` con rutas `project/…`; máximo 255 ficheros y 64 MB por llamada: caben todos). Antes de publicar a una pizarra existente léela con `action: "read"` (el tool lo exige) y fusiona.
5. Los artboards no necesitan `support.js` en la pizarra: lo aporta el tipo *Design*. Si se vieran en blanco al republicar, consulta `reference/format.md` y `reference/design-type-SKILL.md` (reglas del formato x-dc).

Nota: la pizarra original puede haber cambiado desde esta exportación. Para actualizar esta copia, vuelve a leer los ficheros con el tool `Artifact` (`action: "read"`, `paths: [...]`) desde la URL de la pizarra original y sustituye `project/` y `assets/`.

## Qué es de quién

El contenido de `reference/` y `runtime/support.js` viene del tipo de Artifact *Design* de la plataforma (no es código del proyecto); se guarda aquí solo para poder renderizar y reconstruir los mockups sin conexión.
