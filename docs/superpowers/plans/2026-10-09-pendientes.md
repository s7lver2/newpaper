# Pendientes para 2026-10-09

Lista de trabajo acordada el 2026-10-08, después de ejecutar y revisar el plan 02 (privacidad y red) y rediseñar el lector. No hay nada de esto implementado todavía. El repo está limpio en `main` (último commit `1266370`).

Reglas que siguen vigentes: sin bypass de paywall; tests solo para características medianas o grandes y nunca borrar los existentes; sin tests pesados ni e2e completo salvo petición; errores del plan documentados en el fichero de erratas; commits en inglés.

## A. Ya pedidos (iban a empezar hoy, pasan a mañana)

### A1. Transición suave entre páginas con precarga
- Al cambiar de página, en lugar de pasar directamente, precargar la nueva y hacer una transición suave.
- **Desactivable en Ajustes** (propuesta: `appearance.pageTransition`, activado por defecto, en Ajustes › General).
- Limitación técnica: la página original va en una webview nativa que se dibuja siempre por encima de la UI; no se puede fundir con CSS.
- Diseño propuesto: capturar la página actual con `CapturePreview` de WebView2, mostrar la imagen en la UI, precargar la nueva en segundo plano, capturarla al primer pintado (o tras ~1,5–2 s) y hacer un fundido cruzado de unos 300 ms antes de revelar la webview real. Si la captura falla, navegación directa como ahora.
- Casos a cuidar: páginas internas (`newpaper://`), vista Lector (fundido CSS), pestañas en segundo plano, errores de carga, redirecciones rápidas, cambio de tamaño de ventana, `prefers-reduced-motion`. Tor y bloqueo siguen aplicando a la precarga.
- Si CapturePreview resulta inviable: webview doble (la vieja visible hasta el primer pintado de la nueva) y documentar la limitación.

### A2. Bug: al cambiar el circuito de Tor se corta la animación
- Reproducirlo con `NP_FAKE_TOR=1`: botón "Nuevo circuito" (`tor_new_circuit` → `recreate_tab`) y cambio de país con el avión (`tor_set_exit_country` → `recreate_all_content_webviews`).
- Hipótesis: la recreación de webviews bloquea el hilo principal; el vuelo termina de golpe si el backend tarda más de 1,9 s; el popup o la pestaña se remontan al cambiar el id de pestaña y reinician animaciones.
- Arreglo propuesto: crear la webview nueva antes de cerrar la vieja, no reanimar al recrear, desacoplar la animación (CSS) de la respuesta del backend. Añadir animación a "Nuevo circuito" (icono que gira ~1,4 s y texto "Probando otro circuito…", como en `Errores.dc.html`).

## B. Nuevos

### B1. Muchas pestañas: agrupación y manejo sencillo
- Hoy con muchas pestañas la tira se desborda (ya se arregló que el chip de Tor salga de la ventana, pero el manejo sigue siendo pobre).
- Idea: grupos de pestañas con color y nombre (plegables), pestañas agrupadas por dominio u origen, menú de lista de pestañas con buscador, desplazamiento/colapso de las pestañas inactivas, anclar pestañas, cerrar grupo. Decidir con criterio qué es sencillo y satisfactorio.
- Diseñar primero (mockup en la pizarra o descripción) y luego implementar. Debe respetar objetivos de 44 px y accesibilidad por teclado.

### B2. Popup de advertencia por consumo excesivo de recursos
- Cuando la app consume demasiados recursos (memoria/CPU de la app y sus webviews), mostrar un popup que sugiera cerrar el programa (o cerrar pestañas pesadas).
- Ilustración animada: un módulo de memoria RAM casi lleno y a punto de partirse; la animación muestra cómo se va llenando hasta que hace *crack*.
- También en móvil en el futuro (plan 08): dejar el componente y el contrato (umbrales, evento, textos i18n) reutilizables.
- A decidir: umbrales y fuente de medida (procesos de WebView2 vía Windows, memoria de la app), frecuencia de comprobación, forma de descartar o posponer el aviso, y que respete `prefers-reduced-motion` (versión estática del dibujo).

### B3. Imágenes del modo lectura no cargan
- Causa conocida: el proxy `npimg` rechaza `127.0.0.1` por SSRF (visto con los fixtures locales). Comprobar si en páginas reales (El País, etc.) fallan también, y por qué (Tor, cabeceras, `Referer`, hotlinking, formatos, tamaño, lazy-loading `data-src`/`srcset`).
- Arreglar la carga real de imágenes del lector sin relajar la protección contra SSRF.

### B4. Se ve Edge por detrás durante un instante
- Aparece brevemente el navegador/Edge (WebView2) al abrir o recrear pestañas (fondo blanco, marco, barra nativa).
- Revisar: color de fondo de la webview al crearla (`background_color`/`DefaultBackgroundColor`), mostrar la webview solo tras el primer pintado, ventana principal con fondo del tema desde el inicio, parpadeo al recrear webviews.
- Relacionado con A1 y A2.

### B5. Páginas como El País se renderizan "en crudo" al abrirse
- A veces la página se ve sin estilos al cargar (CSS/JS aún no aplicado).
- Posibles causas a investigar: el bloqueo de red (adblock) cortando hojas de estilo o recursos propios de la página (falsos positivos), `WebResourceRequested` devolviendo 403 a algo necesario, el script cosmético ocultando contenido, o una carga parcial por la intercepción. Reproducir con El País y comprobar peticiones bloqueadas por tipo (`stylesheet`, `font`, `script`).
- Si es adblock: no bloquear hojas de estilo del propio sitio de primera parte y revisar las reglas de las listas.

### B6. Modo lectura: fotos enormes (p. ej. la de la reportera)
- Hay imágenes que se quedan enormes y molestan. Limitar tamaño (`max-width: 100%`, alto máximo relativo al viewport, `object-fit`), tratar imágenes de autor/avatares (pequeñas, redondas) distinto de las imágenes de artículo, y respetar los atributos `width`/`height` cuando sean pequeños.

### B7. Menú contextual propio de la app
- Nota: el mensaje decía "click izquierdo"; se interpreta como **clic derecho** (menú contextual). Confirmar al empezar.
- Menú contextual personalizado de la app (no el nativo de WebView2/Edge) en la UI y en las webviews de contenido: según el contexto (enlace, imagen, texto seleccionado, página, campo editable): abrir en pestaña nueva, abrir en lector, copiar enlace, copiar/guardar imagen, buscar el texto seleccionado, analizar (IA), recargar, atrás/adelante, etc.
- Desactivar los menús por defecto de WebView2 (`AreDefaultContextMenusEnabled = false`) y manejar `ContextMenuRequested` en Rust, enviando el contexto a la UI para dibujar el menú con el estilo de la app (tokens `--np-*`, animación `np-pop`).
- Accesibilidad: teclado (tecla de menú, Mayús+F10), foco, `role="menu"`.

### B8. Que no se note NUNCA que usa Chromium/Edge por detrás
- Regla de producto: en ningún punto debe verse Edge/Chromium/WebView2: ni en menús contextuales, ni en diálogos, ni en páginas de error nativas, ni en barras de descarga, ni en `chrome://` o `edge://`, ni en el cuadro de impresión, ni en el selector de archivos si se puede evitar, ni en parpadeos (B4), ni en tooltips, ni en el user agent que ve el usuario, ni en textos de error.
- Auditar: menús contextuales (B7), páginas de error de red de WebView2 (sustituirlas por las propias), navegación a `edge://`/`chrome://` bloqueada, diálogos de permisos (cámara, ubicación, notificaciones) con UI propia, descargas, autocompletado y contraseñas de Edge desactivados, barra de "traducir", teclas F12/Ctrl+U/Ctrl+Shift+I (en release), arrastrar y soltar, marca "Microsoft Edge WebView2" en procesos y en el título de ventanas auxiliares, icono de las ventanas emergentes.
- Resultado esperado: checklist de auditoría y arreglos aplicados; lo que no se pueda ocultar se documenta como limitación.

### B9. Modo lectura: texto basura en artículos con muro de pago
- Párrafos cortados, llamadas a suscribirse ("Suscríbete para seguir leyendo", "Lee sin límites") y texto duplicado o que empieza a mitad de palabra; limpiarlo y avisar de que el artículo está limitado por suscripción, sin ningún bypass (hecho en 1ea371e).

### B10. Portadas y secciones en el lector
- La portada de El País se abría como un artículo gigante: clasificar artículo / listado y ofrecer un "selector de artículos" con filtro (hecho en 1ea371e).

## Orden sugerido
1. B4 y B5 (los fallos más visibles: Edge por detrás y páginas en crudo), junto con B8 (auditoría).
2. B3 y B6 (lector: imágenes).
3. A2 (animación de Tor) y A1 (transición suave), que comparten el tratamiento de la recreación de webviews con B4.
4. B7 (menú contextual).
5. B1 (agrupación de pestañas) y B2 (aviso de recursos), que necesitan diseño previo.
