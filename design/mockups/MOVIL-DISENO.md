# newpaper móvil · diseño v2 (Android)

Rediseño completo de la experiencia móvil. Solo diseño: los artboards están en `design/mockups/project/Movil-*.dc.html` (ver `README.md`), los iconos en `design/mockups/assets/newpaper-icon-*.svg` y `design/mockups/icons/android/`. Este documento es el contrato para implementarlo en `apps/mobile` y `src-tauri/gen/android`.

Principios: calmado y editorial (papel, Newsreader para voz, IBM Plex para interfaz), un solo movimiento principal por pantalla, zonas táctiles >= 48 dp, acciones al alcance del pulgar (abajo), Android primero (borde a borde, gesto atrás, sin iOS), identidad propia (rombo tripartito, anillo de neutralidad, trazo fino).

## Cómo verlo

```bash
node design/mockups/serve.mjs 5611        # http://127.0.0.1:5611/
```

Parámetro `?s=` para saltar a un estado (solo en el servidor local, no cambia el artboard publicado): Bienvenida `?s=0..5|done`, Emparejar `?s=1|2|found|manual|denied|3|4`, Inicio `?s=ready|toast`, Ajustes `?s=ia|pipe|net|blk|src|stage|danger`, Analisis `?s=done|open`.

| Artboard | URL | Qué enseña |
|---|---|---|
| M16 Arranque | `/Movil-Splash.dc.html` | splash con la marca animada → primera carga con esqueletos (botón de repetir) |
| M17 Icono | `/Movil-Icono.dc.html` | icono adaptativo, máscaras, zona segura, capas, icono con tema, alternativas |
| M18 Tab bar | `/Movil-TabBar.dc.html` | iconos en rejilla 24, estados, indicador animado, zonas táctiles |
| M19 Movimiento | `/Movil-Movimiento.dc.html` | tokens y 9 demos vivas + simulación de movimiento reducido |
| M0 Bienvenida | `/Movil-Bienvenida.dc.html` | recorrido a pantalla completa, deslizable |
| M1 Hoy | `/Movil-Inicio.dc.html` | esqueleto → cascada, buscador, tab bar |
| M8 Ajustes | `/Movil-Ajustes.dc.html` | lista agrupada con búsqueda, pantallas apiladas, hojas |
| M11 Emparejar | `/Movil-Emparejar.dc.html` | escáner QR completo |

## Tokens

Fuente única: `design/mockups/tools/motion-base.css` (variables `--m-*`; los colores siguen siendo los `--np-*` de `packages/ui-kit/src/tokens.css`). Para el móvil conviene añadir los `--m-*` a un `apps/mobile/src/tokens-mobile.css` (o a `motion.css` del ui-kit) y consumirlos desde `mobile.css`.

### Movimiento

| Token | Valor | Uso |
|---|---|---|
| `--m-dur-press` | 90 ms | pulsar / soltar (escala .97) |
| `--m-dur-fast` | 160 ms | color, opacidad, borde |
| `--m-dur-base` | 280 ms | cambios de estado, push, fundido de pestañas |
| `--m-dur-sheet` | 380 ms | hoja inferior (spring) |
| `--m-dur-slow` | 420 ms | entrada de contenido (rise) |
| `--m-dur-emph` | 560 ms | splash, hitos |
| `--m-dur-ring` | 900 ms | anillo de neutralidad |
| `--m-dur-shimmer` | 1400 ms | brillo del esqueleto (bucle lineal) |
| `--m-dur-scan` | 2200 ms | línea del escáner QR |
| `--m-stagger` | 45 ms | retardo entre filas (máx. 8 elementos) |
| `--m-ease` | `cubic-bezier(.22,1,.36,1)` | casi todo (= `--np-ease`) |
| `--m-ease-emph` | `cubic-bezier(.05,.7,.1,1)` | push de pantalla, hojas grandes |
| `--m-ease-exit` | `cubic-bezier(.3,0,.8,.15)` | salidas (pop 200 ms, hoja 220 ms) |
| `--m-ease-inout` | `cubic-bezier(.65,0,.35,1)` | trazos, anillos, barras (= `--np-ease-inout`) |
| `--m-spring` | `cubic-bezier(.34,1.56,.64,1)` | hoja, interruptor, icono de pestaña (= `--np-bounce`) |

Reglas: animar solo `transform` y `opacity`; spring solo en objetos con peso (nunca en texto); entradas más lentas que salidas; no bloquear la interacción esperando una animación. Con `prefers-reduced-motion` (o ajuste «reducir animaciones» de Android, que la WebView expone): sin desplazamientos ni escalas, fundidos de 90 ms o instantáneo, anillo completo, esqueletos sin brillo, splash estático 600 ms.

### Medidas

| Token | Valor |
|---|---|
| `--m-top` | 32 px en los mockups; en la app `env(safe-area-inset-top)` (borde a borde) |
| `--m-bottom` | 20 px mínimo; en la app `max(env(safe-area-inset-bottom), 20px)` |
| `--m-hit` | 48 px (zona táctil mínima; los elementos visuales más pequeños llevan área extendida) |
| `--m-gutter` | 20 px (16 px para grupos y tarjetas) |
| `--m-appbar` | 56 px |
| `--m-tabbar` | 64 px + inset de gestos |
| `--m-r-card` / `--m-r-ctl` | 20 px / 16 px |
| Iconos | 24 px (tab bar), 20 px (filas), 22 px (barra superior); trazo 1,75 px, extremos y uniones redondos |
| Tipografía | título grande 36/1,04 Newsreader 500; titular de lista 19–25 Newsreader; cuerpo UI 15/1,45 Plex Sans; fila 16/500 + 13 muted; kicker 11–12 mayúsculas con 0,08–0,1 em; mono 12 |

Contraste: texto secundario `#5E5B55` (6:1), nunca `#8D8981` ni más claro para texto (en los artboards antiguos se sustituyó por `#6B675F`).

## Componentes (clases en `motion-base.css`, nombres sugeridos para `mobile.css`)

`m-appbar` (back 48 px redondo + título Newsreader 21 px + subtítulo 12 px), `m-large` (título grande de raíz), `m-sec` (etiqueta de sección), `m-group` + `m-row` (fila 60 px mínimo: icono 36 en recuadro tintado, título 16/500, subtítulo 13, valor, chevron), `m-switch` (52x32, pomo con spring, área táctil 48), `m-btn` (56 px, `sec`, `soft`, `sm` 48, `paper`), `m-chip` (40 px + área extendida), `m-seg` (segmentado 44 px), `m-card`, `m-sheet` + `m-scrim` + `m-grab`, `m-skel` (esqueleto), `m-tabbar` + `m-tab`, `m-leanbar`.

## Icono de la app

Dirección elegida: **«n.»** — la n de Newsreader en papel sobre tinta, rematada por el rombo tripartito (rojo / gris / azul = izquierda / centro / derecha) como punto final. Es la marca ya usada en el instalador (cuadrado tinta con «n») más el rombo de los hechos del briefing.

Archivos (SVG 108x108, rejilla de iconos adaptativos):

- `assets/newpaper-icon-foreground.svg` = `icons/android/ic_launcher_foreground.svg`: capa frontal, transparente. Toda la marca cabe en el círculo de 66 (zona segura).
- `…-background.svg`: tinta `#17171A` + tres reglas de columna casi invisibles. Alternativa mínima: color plano `#17171A`.
- `…-monochrome.svg`: silueta de un solo color para icono con tema (Android 13+).
- `…-full.svg`: cuadrado a sangre completa para Play Store (512x512) y como fuente de `tauri icon`.

Implementación en `src-tauri/gen/android/app/src/main/res` (los `mipmap-*` actuales son el icono por defecto de Tauri):

1. Convertir foreground y monochrome a VectorDrawable (`drawable/ic_launcher_foreground.xml`, `drawable/ic_launcher_monochrome.xml`; Android Studio > Vector Asset o `svg2vd`; los trazos se pueden mantener). Fondo: `values/ic_launcher_background.xml` con `#17171A` o `drawable/ic_launcher_background.xml` desde el SVG.
2. `mipmap-anydpi-v26/ic_launcher.xml` (y `ic_launcher_round.xml`):
   `<adaptive-icon><background android:drawable="@color/ic_launcher_background"/><foreground android:drawable="@drawable/ic_launcher_foreground"/><monochrome android:drawable="@drawable/ic_launcher_monochrome"/></adaptive-icon>`
3. Para versiones antiguas (<26) y el repositorio: `npx tauri icon design/mockups/assets/newpaper-icon-full.svg` regenera `src-tauri/icons/*` (y los PNG de `mipmap-*`). OJO: `tauri icon` también regenera iOS/Windows; si se quiere conservar el icono de escritorio actual, copiar solo los `mipmap-*`.
4. Icono de notificación: `ic_stat_newpaper` monocromo 24 dp a partir de `…-monochrome.svg` (solo la silueta, sin rombo partido).

Alternativas descartadas (en M17): B solo rombo tripartito (más abstracta, pierde la voz tipográfica), C papel claro (no distingue en pantallas claras de launcher). Pregunta abierta: ¿se prefiere B por ser más ajena a «cualquier app de lectura»?

## Arranque (splash y primera carga)

- Android 12+: `Theme.SplashScreen` con `windowSplashScreenBackground` `#F6F4EF`, `windowSplashScreenAnimatedIcon` = foreground (AnimatedVectorDrawable de <= 1 s, sin fondo de icono) y `postSplashScreenTheme`. El sistema controla ese tramo.
- Dentro de la app, `Splash.tsx` continúa sin salto (misma posición): cuadrado tinta 132 px aparece con escala .84 → 1 (560 ms, `--m-ease-emph`), la n se dibuja (stem 260 ms, arco 520 ms, `stroke-dashoffset` con `pathLength=1`), serifs en fundido, el rombo salta con spring y sus tres tramos entran de izquierda/centro/derecha, luego «newpaper» y la frase («Lee. Contrasta. Decide tú.») suben con rise, y una barra roja/gris/azul de 96 px se rellena por tramos. Duración total ~2,2 s mínimo; se queda hasta que los datos locales están listos (no esperar a red). Salida: fundido + escala 1.04 en 280 ms con `--m-ease-exit`.
- Primera carga de Hoy: esqueleto con la forma exacta del contenido (saludo, buscador, 4 filas de titular + barra de posición), brillo lineal 1,4 s, y cuando llegan los datos el contenido entra en cascada (45 ms). Sin spinners en ninguna pantalla.

## Barra de pestañas

- 4 pestañas raíz: Hoy, Leyendo, Agente, Ajustes. Iconos propios de trazo (ver `M18`): periódico, libro abierto, burbuja con destello, deslizadores. Paths (viewBox 24, trazo 1,75, sin relleno salvo la copia `.fill` del contorno principal para el estado activo):
  - Hoy: `M5.5 4h13A1.5 1.5 0 0120 5.5v13a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 18.5v-13A1.5 1.5 0 015.5 4z` + `M8 9h8M8 12.5h8M8 16h4.5`
  - Leyendo: `M12 7c-1.8-1.5-4.5-2-7.5-1.5V18c3-.4 5.7.1 7.5 1.5 1.8-1.4 4.5-1.9 7.5-1.5V5.5C16.5 5 13.8 5.5 12 7z` + `M12 7v12.5`
  - Agente: `M6 4.5h12a2 2 0 012 2V15a2 2 0 01-2 2h-6.5L7 20.5V17H6a2 2 0 01-2-2V6.5a2 2 0 012-2z` + `M12 7.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z`
  - Ajustes: `M4 8h8M17 8h3M4 16h3M12 16h8` + círculos r=2.5 en (14.5,8) y (9.5,16)
  (el resto de iconos de filas está en `Movil-Ajustes.dc.html`, objeto `IC`).
- Inactivo: icono y etiqueta `#5E5B55`. Activo: icono azul `--np-accent` con relleno suave 16 % y píldora 64x32 `--np-accent-soft` que se ensancha desde el centro (scaleX .35 → 1, 280 ms `--m-ease`), icono rebota (spring), etiqueta en tinta.
- Alto 64 px + inset de gestos; cada pestaña ocupa 1/4 del ancho y 48+ px de alto táctil. Punto rojo (8 px) en Hoy para edición nueva sin leer, nunca contadores.
- Se oculta en pantallas apiladas (lectura, agente, síntesis, ajustes secundarios, escáner). Tocar la pestaña activa sube al inicio; segunda vez recarga.
- Cambio de raíz: fundido 280 ms, sin deslizamiento lateral; cada pestaña conserva su scroll.

## Navegación y gesto atrás

Raíces: Hoy, Leyendo, Agente, Ajustes (tab bar). Apiladas: Síntesis, Hemeroteca, Edición, Historial, Proveedor, Emparejar, subpantallas de Ajustes. Push: 280 ms `--m-ease-emph`, la de debajo se desplaza −24 % y se atenúa al 60 %; pop 200 ms `--m-ease-exit`. Gesto atrás predictivo en Android 14+ (`onBackPressedDispatcher` + progreso a una variable CSS `--back-progress`); siempre vuelve por el historial de hash (`router.ts` ya lo hace). Una hoja abierta se cierra antes que la pantalla.

## Pantalla a pantalla: cambios frente a la implementación actual

La implementación actual (`apps/mobile/src/mobile.css`, `screens/*`) usa una barra de pestañas de texto sin iconos legibles, tarjetas `m-card` genéricas, `m-title` 28 px, sin transiciones y casi todo a 44 px. El móvil v2 cambia:

1. **Bienvenida (M0)** (`Welcome.tsx`). Antes: lista de pasos con barras. Ahora: carrusel a pantalla completa de 6 páginas deslizables (arrastre con el dedo, umbral 60 px, rebote en los extremos): 1 intro sobre tinta con «Lee. Contrasta. Decide tú.» y marca; 2 «Una noticia, seis medios» (ilustración: tarjeta con espectro y 6 puntos que saltan en cascada + anillo que se dibuja); 3 la lente (texto apagado que se enciende por tramos, 600 ms); 4 el agente (pregunta, puntos de escritura, respuesta con citas); 5 temas (chips de 48 px); 6 IA (3 opciones tipo radio). Progreso en puntos (el activo se alarga a 22 px), «Saltar» arriba a la derecha (hasta el paso 4), botón principal de 56 px abajo + «atrás» cuadrado de 56 px, safe areas arriba y abajo, fondo del intro en tinta con barra de estado clara. Pantalla final «Listo.» con check que se dibuja. Se elimina la opción de red Tor/directa del onboarding (Tor está fuera en Android; la red se decide en Ajustes).
2. **Hoy (M1)** (`Today.tsx`). Antes: título y lista densa. Ahora: marca + botón de actualizar (48) arriba, kicker con la fecha, «Buenos días.» 42 px, subtítulo en cursiva, buscador de 52 px con icono (resultados en desplegable con filas de 56 px), «Tu briefing» con numeración, la primera noticia destacada (25 px, etiqueta «DESTACADA»), barra de posición de 52 px y metadatos de 13 px; temas en chips de 40 px; snackbar oscuro «Compartido desde Telegram» como hoja con resorte sobre la tab bar. Primera carga con esqueleto, luego cascada. Quitado el chip «Tor · ES».
3. **Lectura y análisis (M2)** (`Reading.tsx`, `AnalysisSheet.tsx`). Antes: hoja plana. Ahora: barra con medio y posición (mono 12) y botón de lente (48, oscuro cuando está activa), titular 31 px, banner de IA como tarjeta tocable, texto 18/1,7 con marcas por veredicto; la hoja inferior tiene dos fases: progreso por pasos («Leyendo… Buscando coberturas… Contrastando… Redactando», barra ease-inout, check por paso) y resultado (anillo que se dibuja 900 ms con cuenta). Expandida: segmentado Análisis/Coberturas, afirmaciones con veredicto, enlace a Hemeroteca y «Leer la noticia neutral». Altura animada con spring; sin tab bar.
4. **Agente (M4, M14)** (`Agent.tsx`). Cita con filete azul, burbuja del usuario 16/4, respuesta serif con citas numeradas, fuentes en lista, sugerencias como chips; compositor anclado abajo con sombra superior, modos Preguntar/Verificar/Explicar en chips de 40 px, campo de 52 px redondo y botón de enviar de 52 px.
5. **Síntesis (M3)**. Cabecera de 48 px con segmentado Breve/Completa/Cambios y botón de tema; datos clave, gráficos con barras que crecen con `--m-ease`, voces y posiciones; barra inferior «Pregunta sobre esta noticia» con inset de gestos; tarjeta de fuente (oscura) sube como hoja.
6. **Sin cobertura (M7)**, **Hemeroteca (M6)**, **Historial (M13)**, **Edición sin conexión (M12)**, **Proveedor (M15)**, **404/errores (M9)**, **Tres en raya (M10)**: misma estructura que antes pero con barra superior unificada (back 48 px redondo, título Newsreader 21), insets de estado/gestos con variables, entrada con push de 280 ms, contraste del texto secundario corregido (`#6B675F`), tamaños mínimos de texto 11–12 px, chips y segmentados de 40–48 px y botones de envío/compositor de 52 px. Edición lleva la nueva tab bar. Pendiente en implementación: pasar estas pantallas a las clases `m-*` en vez de estilos en línea.
7. **Ajustes (M8)** (`Settings.tsx`) — rediseño total. Antes: segmentado IA/Red/Fuentes/Bloqueo y rejilla de tarjetas. Ahora: título grande, buscador «Buscar un ajuste» (filtra filas), tarjeta resumen oscura «Tu análisis» (coste, tiempo, pasos en local, barra verde/azul) que abre IA, y grupos con cabecera: Inteligencia artificial (IA y proveedores, Pipeline), Privacidad y red (Conexión, Bloqueo de anuncios), Contenido (Fuentes y posición, Edición sin conexión, solo Wi-Fi), Dispositivos (Emparejar con el PC, Historial), Apariencia (segmentado Papel/Tinta/Sistema), Acerca de, y una **zona de peligro** separada (borde y fondo rojizos, texto rojo: borrar historial, olvidar dispositivo, borrar claves, restablecer) con hoja de confirmación. Cada fila: icono tintado 36, título 16/500, subtítulo 13, valor y chevron (o interruptor). Subpantallas apiladas: IA y proveedores (configuraciones rápidas 2x2, proveedores con interruptor), Pipeline (8 pasos con chip Local/Nube y hoja para elegir proveedor y modelo), Conexión (Directa / VPN / Tor «futuro» desactivado + protecciones), Bloqueo (maestro, contadores que cuentan, listas), Fuentes (espectro, medios con interruptor y balance). Raíz: filas de 60 px, gutter 16, agrupadas en tarjetas de radio 20.
8. **Emparejar (M11)** (`Pair.tsx`). Antes: pasos con vista previa de cámara dibujada. Ahora: intro limpia (ilustración PC↔móvil, 3 garantías, botón de escanear, «código a mano», «importar .npsync»); **escáner a pantalla completa** (vista de cámara oscura, velo con recorte redondeado 260x260, cuatro esquinas de 4,5 px que respiran, línea de escaneo que baja 2,2 s `--m-ease-inout` en bucle, estado «BUSCANDO CÓDIGO»/«CÓDIGO LEÍDO», linterna en la barra superior (48, se rellena al activarla), «Introducir código a mano» abajo → hoja con campo mono de 64 px); **éxito**: esquinas verdes, el QR se centra, círculo verde con check que se dibuja (420 ms) y paso automático a la huella; **permiso denegado**: pantalla propia con icono de cámara tachada, explicación de la ruta en Ajustes de Android, botón «Abrir los ajustes de Android» y alternativa manual; comprobación de huella (3 grupos mono de 30 px, «No coinciden» cancela con aviso); selección de datos con interruptores y progreso por fila. Barra de estado clara sobre el escáner. Usar `BarcodeScanner` nativo (p. ej. plugin de Tauri para cámara / ML Kit) con la superposición de la webview por encima.
9. **Tor (M5)**: se conserva como **diseño futuro**, sin cambios: Tor no se implementa en Android por ahora (nota en el canvas). La hoja «Salida de Tor» sigue la hoja estándar (spring).
10. **Tab bar y movimiento** (`App.tsx`, `mobile.css`): ver arriba.

## Lista de implementación priorizada

P0 (la app deja de verse cruda)
1. Añadir los tokens `--m-*` y las clases base (`motion-base.css` como punto de partida) a `apps/mobile/src/mobile.css`; fuentes Newsreader/IBM Plex ya cargadas por el ui-kit.
2. Tab bar con iconos SVG (`App.tsx` + `.m-tabbar`), píldora animada, inset de gestos, ocultar en pantallas apiladas.
3. Borde a borde: `enableEdgeToEdge`, `viewport-fit=cover`, `env(safe-area-inset-*)` arriba/abajo, barra de estado transparente con iconos claros/oscuros según pantalla.
4. Icono adaptativo + monochrome (sección Icono) y `Theme.SplashScreen` papel.
5. Ajustes rediseñados (lista agrupada + buscador + subpantallas + zona de peligro).
6. Barra superior unificada (`m-appbar`) y `button`/`a` con feedback de pulsación (`scale(.97)` 90 ms) en todo `.m-app`.

P1
7. Transiciones push/pop entre rutas por hash (`router.ts` mantiene dirección: push/pop/tab) y fundido entre pestañas; hoja con spring; gesto atrás predictivo.
8. Splash animado en la app + esqueleto de Hoy + cascada de filas.
9. Escáner QR a pantalla completa con linterna, estado éxito, permiso denegado y entrada manual.
10. Onboarding en carrusel deslizable con las 6 páginas y la pantalla final.
11. Hoja de análisis con progreso por pasos y anillo animado; lente con transición de color 900 ms.

P2
12. Pull-to-refresh en Hoy (anillo que se dibuja, giro, aviso «N hechos nuevos»).
13. Pasar el resto de pantallas (Hemeroteca, Historial, Edición, Proveedor, Sin cobertura, errores) de estilos en línea a clases `m-*`.
14. Modo tinta (`[data-theme='ink']` ya existe en tokens; faltan los artboards) y selector Papel/Tinta/Sistema.
15. Animaciones de gráficos de Síntesis (barras con `--m-ease`), `prefers-reduced-motion` probado con el ajuste de Android «Eliminar animaciones».

## Preguntas abiertas

- Icono: ¿«n.» (elegido) o la alternativa B (solo rombo)? Hay también un fondo liso alternativo (sin reglas de columna).
- Pestañas: ¿mantener «Leyendo» y «Agente» como raíces con lista de sesiones? Los mockups solo muestran sus pantallas de sesión (apiladas, sin tab bar); falta diseñar la raíz de cada una (lista de lo abierto / conversaciones).
- Splash: el sistema limita la animación nativa a ~1 s; la animación completa de ~2,2 s vive dentro de la app. Si se prefiere no alargar el arranque, mostrarla solo en el primer inicio.
- Tema tinta móvil no diseñado todavía.
