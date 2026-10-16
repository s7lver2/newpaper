# newpaper móvil · diseño v2 (Android)

Rediseño completo de la experiencia móvil. Solo diseño: los artboards están en `design/mockups/project/Movil-*.dc.html` (ver `README.md`), los iconos en `design/mockups/assets/newpaper-icon-*.svg` y `design/mockups/icons/android/`. Este documento es el contrato para implementarlo en `apps/mobile` y `src-tauri/gen/android`.

Principios: calmado y editorial (papel, Newsreader para voz, IBM Plex para interfaz), un solo movimiento principal por pantalla, zonas táctiles >= 48 dp, acciones al alcance del pulgar (abajo), Android primero (borde a borde, gesto atrás, sin iOS), identidad propia (rombo tripartito, anillo de neutralidad, trazo fino).

## Cómo verlo

```bash
node design/mockups/serve.mjs 5611        # http://127.0.0.1:5611/
```

Parámetro `?s=` para saltar a un estado (solo en el servidor local, no cambia el artboard publicado): Arranque `?s=<ms>|short|reduce` (+ `&ui=0` oculta los controles de demo), Bienvenida `?s=0..5|done` (+ `&rm=1` simula movimiento reducido), Emparejar `?s=1|2|found|manual|denied|shake|3|4|sync|done`, Proveedor `?s=home|all|search|open|local|key|keykb|how|login|loginerr|server|ollama|ollama-unpaired|test|test-slow|ok|fail|fail-net|fail-quota|fail-local|preset|adv|picker|done`, IA `?s=list|empty|edit|edit-login|testing|test-ok|test-bad|disc|offline`, Conexión `?s=direct|boot|warm|stall|slow|failed|ready|ready-warm|netchange|reset`, Inicio `?s=ready|toast`, Ajustes `?s=ia|pipe|net|blk|src|stage|danger`, Analisis `?s=done|open`. Todos aceptan `rm=1` donde hay movimiento propio.

| Artboard | URL | Qué enseña |
|---|---|---|
| M16 Arranque | `/Movil-Splash.dc.html` | **intro estilo arranque de Balatro: remolino de pintura, cascada de periódicos que giran y rebotan, encaje en la n, estallido** → logo limpio → iris hacia la app; selector Primer inicio / Siguientes / Mov. reducido y línea de tiempo arrastrable |
| M16b Arranque, fotogramas | `/Movil-ArranqueLinea.dc.html` | 8 + 4 + 3 fotogramas con el mismo motor, medida de diferencia con el splash nativo (0 px) y tabla de empalme Android |
| M17 Icono | `/Movil-Icono.dc.html` | icono adaptativo, máscaras, zona segura, capas, icono con tema, alternativas |
| M18 Tab bar | `/Movil-TabBar.dc.html` | iconos en rejilla 24, estados, indicador animado, zonas táctiles |
| M19 Movimiento | `/Movil-Movimiento.dc.html` | tokens y 9 demos vivas + simulación de movimiento reducido |
| M0 Bienvenida | `/Movil-Bienvenida.dc.html` | recorrido deslizable con paralaje, indicador de pasos animado, micro-animaciones por paso y celebración final |
| M1 Hoy | `/Movil-Inicio.dc.html` | esqueleto → cascada, buscador, tab bar |
| M8 Ajustes | `/Movil-Ajustes.dc.html` | lista agrupada con búsqueda, pantallas apiladas, hojas |
| M11 Emparejar | `/Movil-Emparejar.dc.html` | todo el flujo animado: intro con paquetes PC↔móvil, escáner con bloqueo, apretón de manos, huella que se revela, alcance y sincronización |
| M15 Proveedor | `/Movil-Proveedor.dc.html` | asistente de 3 pasos equivalente al de escritorio (elegir, clave/inicio de sesión/servidor, prueba honesta, punto de partida, límite, avanzado) |
| M20 IA | `/Movil-IA.dc.html` | IA y proveedores: resumen, lista con estado, hoja de edición/prueba, desconectar con deshacer, punto de partida, límite |
| M21 Conexión | `/Movil-Conexion.dc.html` | Directa/Tor con los estados de Tor: arranque con fases honestas, «tarda más», fallo, listo, cambio de red, restablecer |

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
| `--m-dur-intro` | 4640 ms | intro de primer inicio: coreografía 3780 ms + pausa 400 + iris 460 (ver Arranque y la tabla de hitos) |
| `--m-dur-intro-short` | 1620 ms | intro de los siguientes inicios: 1240 + pausa 120 + iris 260 |
| `--m-dur-intro-reduce` | 800 ms | intro con movimiento reducido (solo fundidos) |
| `--m-dur-iris` | 360 ms | iris que descubre la app tras la intro (`ease-in-out`) |
| `--m-dur-packet` | 1500 ms | un paquete de datos recorre el enlace PC↔móvil (`--m-ease-inout`, en bucle desfasado) |
| `--m-par-art` / `--m-par-text` | 0,65 / 1,25 | paralaje del carrusel: la ilustración avanza al 65 % del desplazamiento de la página, el texto al 125 % (y se atenúa con |p|) |
| `--m-ease` | `cubic-bezier(.22,1,.36,1)` | casi todo (= `--np-ease`) |
| `--m-ease-emph` | `cubic-bezier(.05,.7,.1,1)` | push de pantalla, hojas grandes |
| `--m-ease-exit` | `cubic-bezier(.3,0,.8,.15)` | salidas (pop 200 ms, hoja 220 ms) |
| `--m-ease-inout` | `cubic-bezier(.65,0,.35,1)` | trazos, anillos, barras (= `--np-ease-inout`) |
| `--m-spring` | `cubic-bezier(.34,1.56,.64,1)` | hoja, interruptor, icono de pestaña (= `--np-bounce`) |

Los mockups animan alguna vez `left`, `width` o `grid-template-rows` por comodidad (paquetes, acordeones): en la app se implementan con `transform`/`opacity` (medir y animar `translateX`) o `grid-template-rows` solo en acordeones cortos.

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

## Arranque (intro animada y primera carga)

Concepto (M16 y M16b, v4): el lenguaje de movimiento es el del arranque de **Balatro**, no una atracción gravitatoria. El fondo es un **remolino de «pintura»** (warp de dominio) a muy baja resolución (72×156 px escalados sin suavizado, ≈ 5,4 px lógicos por píxel), en una paleta derivada de la marca y oscura: tinta `#17171A`, rojo prensa `#C44A3C`, azul `#3656B8` y casi negro `#16161F`, con viñeta y barrido CRT (una de cada tres filas más oscura). Sobre él cae una **cascada de 32 hojas de periódico con grosor** (sprite con grano de papel, rótulo de color, columnas de texto, foto, esquina doblada, borde de varias capas y sombra) que entran por los bordes en **espiral**, **voltean** como cartas (el anverso pasa a un reverso con una n), se **estiran** en el sentido del movimiento, pasan de largo con **sobreimpulso** y aterrizan con un **rebote elástico** (squash & stretch). Toda la escena **gira lentamente y hace zoom** (−17° y +17 % que se endereza hasta ~2 s) y cada aterrizaje da un **temblor de pantalla** y un empujón de zoom. Las hojas forman un **abanico** de mano de cartas, «inhalan» (−13 %) y **saltan encajando en la n** (arco curvo, estiramiento ×1,55, sobreimpulso fuerte) con un impacto de 7 px de temblor y **franja cromática** (copias roja y azul desplazadas en modo `lighter`). La n de papel queda formada; el **remolino se enrolla** (la torsión radial se multiplica) y **colapsa** hasta un punto que **estalla**: destello, onda de choque con borde rojo/azul y **temblor de 11 px**, y aparece la **marca limpia: n blanca `#F6F4EF` y rombo sobre fondo tinta**, con squash & stretch rápido. El rombo tripartito se enciende con resorte (centro con escala, izquierda y derecha deslizando) y da un último temblor. Un **iris** (círculo que se abre desde el centro, 360 ms) descubre la app.

Hitos del primer inicio (v5). Dos tiempos: **real** (lo que ve el usuario) e **interno** (el de la coreografía; real = interno × 1,4 hasta 2700 interno = 3780 ms reales). Los de «siguientes» usan ×0,46.

| real ms | interno | Hito | Detalle |
|---|---|---|---|
| 0 | 0 | Splash nativo | tinta + n y rombo fantasma `#34343B`; 0 px de diferencia con `drawNative()`; remolino, hojas y temblor a cero |
| 84–784 | 60–560 | El remolino se abre | círculo que crece de 30 a 790 px con `easeOutCubic`, alfa 0,35 → 1, giro inicial que se frena |
| 170–1960 | 120–1400 | Cascada | 32 hojas con salida escalonada, 700–830 ms reales de vuelo: espiral, sobreimpulso `easeOutBack(1,3)`, volteo de 2–4 medias vueltas, escala 3,4 → 2,3, estiramiento; aterrizaje con rebote elástico |
| 2030–2240 | 1450–1600 | Abanico | las hojas descansan en un abanico (±0,43 rad) y «inhalan» −13 % |
| 2240–2870 | 1600–2045 | Encaje en la n | 32 saltos de 406 ms reales, `easeOutBack(2,3)`, arco lateral, estiramiento ×1,55; la n de papel se rellena de 1720 a 2050 interno |
| 2460 | 1760 | Impacto | temblor 7 px y franja cromática (solo calidad 0) |
| 2660–3160 | 1900–2260 | El remolino se apaga | se enrolla (torsión ×26), su radio cae con `1−s²` **y se desvanece** (alfa `1−sm(2000,2300)`): sin corte |
| 2940 | 2100 | Estallido suave | destello que **sube** en ~200 ms (alfa máx. 0,38; antes 0,6 de golpe) y onda de choque; las hojas se desvanecen de 2040 a 2320 interno |
| 2910–3390 | 2080–2420 | **Fundido a n blanca** | la n de papel (textura) pasa a `#F6F4EF` con `smoothstep` durante 340 interno ≈ 475 ms reales; la de papel se mantiene opaca debajo, así la cobertura nunca baja a mitad del fundido; squash & stretch (+14 %/−10 %) y franja cromática |
| 3050–3780 | 2180–2700 | Rombo | aparece con `smoothstep` de 220 interno, resorte `easeOutBack(1,9)`, temblor de 3,5 px |
| 3780–4180 | — | **Pausa** | 400 ms con la marca (n + rombo) formada y quieta; el lienzo no se redibuja |
| 4180–4640 | — | Iris | agujero circular transparente en el propio lienzo (`destination-out`, 0 → 920 px, `smoothstep`, 460 ms) sobre el esqueleto de Hoy (o la Bienvenida la primera vez) |

**Siguientes inicios** (1620 ms): mismo motor con el tiempo ×0,46, 16 hojas (las pares), pausa de 120 ms e iris de 260 ms; la secuencia de hitos es idéntica. Solo se muestra la larga la primera vez (o tras «borrar datos»). **Movimiento reducido** (`prefers-reduced-motion` o «Eliminar animaciones» de Android): sin remolino, sin hojas, sin temblor ni zoom, sin iris: 0–120 ms n fantasma, 120–340 fundido a la marca limpia y rombo, 340–640 pausa, 640–800 fundido a la app.

Tokens de movimiento de la intro: temblor = Σ `A·e^(−d/τ)·cos(0,09 d)` con (A, τ) = (1,7, 75) por hoja, (7, 120) encaje, (11, 120) estallido, (3,5, 100) rombo; empuje de zoom = `0,0045·A` por evento; franja cromática = ±6 px de desplazamiento (copias `#FF3D3D` y `#2D8CFF`, `lighter`, alfa ≤ 0,6); rebote elástico = `e^(−d/τ)·cos(ω d)` con τ 85–110 ms; sobreimpulso = `easeOutBack` con c1 1,3 (vuelo), 2,3 (encaje) y 1,9 (rombo). Nada es aleatorio en tiempo de ejecución: semilla fija (`rng(11)` para hojas, `rng(5)` para el grano de los sprites).

Implementación: `NPIntro.draw(ctx, t, mode)` (en `tools/intro-engine.js`, sin dependencias) es una **función pura del tiempo** (modos `first`, `short`, `reduce`): dibuja el fotograma t en un `<canvas>` 2D de 390×844 lógicos (el llamante aplica `setTransform(dpr,0,0,dpr,0,0)`, `dpr` máx. 2). API completa: `draw(ctx,t,mode)`, `drawNative(ctx)` (splash nativo), `hand(t,mode)` → `{iris,fade}` (radio del iris y fundido para la capa DOM), `TOT`, `T` (hitos), `phases` (etiquetas del demo), `setQuality(0|1|2)` (remolino 72×156 / 48×104 / 32×70; no cambia la API de dibujo) y `sm`. Cambios respecto a v3: `T` tiene otras claves (`swirl, fly, fan, snap, hit, collapse, burst, clean, dia, hand`) y se añade `setQuality`; `draw`, `drawNative`, `hand`, `TOT` y `phases` conservan su firma. No hay variante WebGL: el remolino es un bucle de 11 232 píxeles con tablas de seno (sin `Math.sin`) que se recalcula a 30 Hz (paso `floor(t/33,3 ms)`, así sigue siendo función pura del tiempo) y se pinta escalado sin suavizado; si hiciera falta, el mismo cálculo cabe en un fragmento de GLSL a 72×156 y `draw()` seguiría siendo el respaldo en canvas 2D. La app lo llama desde `requestAnimationFrame` con `t = performance.now() − t0`; si un fotograma tarda más de 24 ms avanza el tiempo y no el número de fotogramas (nunca se alarga el arranque). La app debe seguir arrancando mientras suena la intro: los datos locales se cargan detrás y la intro solo espera su duración mínima; salida inmediata (iris acelerado a 200 ms) si Hoy ya está listo y el usuario toca la pantalla.

Presupuesto de rendimiento: nada se asigna por fotograma (sprites, tablas, paleta con viñeta y barrido, siluetas cromáticas y el degradado del destello se crean una vez en el primer `draw`); por fotograma ≤ 32 `drawImage` de sprites + 1 del remolino + trazos de la n; el remolino cuesta ≈ 1,3 ms (JS, escritorio) cada 33 ms. Medido en el panel de navegador (escritorio, sin GPU, canvas de 780×1688 = dpr 2): 1–4 ms de JS por fotograma (mediana) y ≈ 23 ms con la rasterización por software forzada; en una WebView con canvas acelerado la rasterización pasa a la GPU. Regla de degradación (v5): `calibrate()` mide el coste real del remolino durante el splash nativo y elige la calidad inicial (≤ 3,5 ms por recálculo); durante la intro la app toma la **mediana de los últimos 12 fotogramas** (rAF) y baja una calidad si pasa de 18 ms (sin subir nunca). Calidades: remolino 72×156 a 30 Hz / 48×104 a 24 Hz / 32×70 a 20 Hz; `devicePixelRatio` máx. 1,5 / 1,25 / 1; la franja cromática de las hojas solo en la calidad 0. La n y sus franjas se pintan desde sprites precalculados, el iris se recorta en el propio lienzo (`destination-out`, sin máscara CSS) y durante la pausa no se redibuja nada.

### Empalme con el splash nativo de Android (sin salto visible)

Regla: **el primer fotograma de la intro es idéntico al splash nativo**. Por eso el estado inicial es «tinta + n y rombo fantasma» y no la marca blanca: M16b mide la diferencia entre `drawNative()` y `draw(0)` (0 px).

- Android 12+ (`androidx.core:core-splashscreen`): `Theme.SplashScreen`, `windowSplashScreenBackground` = `#17171A` (también `<item name="android:windowBackground">` para <12), `windowSplashScreenAnimatedIcon` = VectorDrawable **estático** con la n y el rombo en `#34343B` (no AnimatedVectorDrawable, no `windowSplashScreenIconBackgroundColor`) y `postSplashScreenTheme` = tema de la actividad. El sistema recorta el icono a un círculo de 2/3 del lienzo de 288 dp (icono de 192 dp): la marca completa mide 54×32,5 unidades de un viewBox de 108, es decir ≈ 50 % del lienzo y cabe sin recorte.
- Tamaño en pantalla: el canvas pinta la marca con 4,2 px lógicos por unidad (ancho 227 px, centrada). El icono nativo se dibuja con el mismo escalado respecto al centro de la ventana; comprobar con captura superpuesta en un Pixel (densidad 2,6) y un dispositivo compacto, y ajustar solo el `scale` del VectorDrawable, no del canvas.
- Traspaso: `splashScreen.setKeepOnScreenCondition { !introReady }`. `introReady` pasa a true **cuando el canvas ha pintado su primer fotograma** (`requestAnimationFrame` tras el primer `draw(0)`, avisado por `invoke('intro_ready')` o `window.NP_INTRO_READY`); entonces el sistema retira su splash y se ve el mismo fotograma. Nada de `setOnExitAnimationListener` con animación propia (añadiría un fundido de 200–300 ms que el ojo nota como parpadeo).
- Fondo de la WebView transparente hasta ese momento y `#17171A` por CSS en `html,body` para que no asome blanco entre el splash y el primer fotograma. Barras del sistema: transparentes con iconos claros mientras dura la intro (`WindowInsetsControllerCompat.isAppearanceLightStatusBars = false`); al terminar el iris, cada pantalla decide su tono (Hoy: iconos oscuros).
- Android < 12: `windowBackground` = drawable con `#17171A` y el mismo vector centrado (`layer-list`); mismo criterio de traspaso con un `View` ligero hasta el primer fotograma.
- Con «Eliminar animaciones» el sistema omite la animación del icono; como el nuestro es estático no cambia nada. La intro reducida (800 ms) también empieza en el mismo fotograma.
- Primera ejecución tras instalar: el destino de la intro es la **Bienvenida** (no Hoy) y la marca de 88 px del primer paso **vuela desde el centro** (translate + escala ×5,15, 760 ms, `--m-ease-emph`), de modo que el logo grande se convierte en el de la pantalla de bienvenida sin corte (M0 ya lo hace cuando se abre sin `?s=`).

Primera carga de Hoy: esqueleto con la forma exacta del contenido (saludo, buscador, 4 filas de titular + barra de posición), brillo lineal 1,4 s, y cuando llegan los datos el contenido entra en cascada (45 ms). Sin spinners en ninguna pantalla.

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
- Cambio de raíz: eje compartido. La pestaña que sale se desvanece en 110 ms desplazándose 14 px hacia el lado contrario al del cambio; la que entra llega en 420 ms (`--m-ease`, 70 ms de retardo) desde 28 px del lado del orden de pestañas (derecha si el destino está a la derecha), y sus 6 primeros bloques entran en cascada de 30 ms (10 px). La píldora de la barra es un único elemento que se desliza entre pestañas (420 ms `--m-ease`). Solo `transform` y `opacity`; todas las raíces siguen montadas y conservan su scroll. Con movimiento reducido: cambio instantáneo, píldora sin deslizar.

## Navegación y gesto atrás

Raíces: Hoy, Leyendo, Agente, Ajustes (tab bar). Apiladas: Síntesis, Hemeroteca, Edición, Historial, Proveedor, Emparejar, subpantallas de Ajustes. Push: 280 ms `--m-ease-emph`, la de debajo se desplaza −24 % y se atenúa al 60 %; pop 200 ms `--m-ease-exit`. Gesto atrás predictivo en Android 14+ (`onBackPressedDispatcher` + progreso a una variable CSS `--back-progress`); siempre vuelve por el historial de hash (`router.ts` ya lo hace). Una hoja abierta se cierra antes que la pantalla.

## Pantalla a pantalla: cambios frente a la implementación actual

La implementación actual (`apps/mobile/src/mobile.css`, `screens/*`) usa una barra de pestañas de texto sin iconos legibles, tarjetas `m-card` genéricas, `m-title` 28 px, sin transiciones y casi todo a 44 px. El móvil v2 cambia:

1. **Bienvenida (M0)** (`Welcome.tsx`). Antes: lista de pasos con barras. Ahora: carrusel a pantalla completa de 6 páginas deslizables (arrastre con el dedo, umbral 60 px, rebote en los extremos): 1 intro sobre tinta con «Lee. Contrasta. Decide tú.» y marca; 2 «Una noticia, seis medios» (ilustración: tarjeta con espectro y 6 puntos que saltan en cascada + anillo que se dibuja); 3 la lente (texto apagado que se enciende por tramos, 600 ms); 4 el agente (pregunta, puntos de escritura, respuesta con citas); 5 temas (chips de 48 px); 6 IA (3 opciones tipo radio). Progreso en puntos (el activo se alarga a 22 px), «Saltar» arriba a la derecha (hasta el paso 4), botón principal de 56 px abajo + «atrás» cuadrado de 56 px, safe areas arriba y abajo, fondo del intro en tinta con barra de estado clara. Pantalla final «Listo.» con check que se dibuja. Se elimina la opción de red Tor/directa del onboarding (la red se decide en Ajustes › Conexión).

   **Animación (v3).** Paralaje al deslizar: cada página lleva `--p` (posición respecto al centro) y tres capas se desplazan a ritmos distintos (ilustración 0,65×, texto 1,25× con fundido, fondo 1×; la transición al soltar usa el mismo `--m-ease-emph` y se apaga mientras se arrastra). Indicador: seis segmentos de 30×4 px que se rellenan de izquierda a derecha (420 ms) más un contador mono «3 / 6» que sube con un fundido corto. Micro-animaciones por paso: 1 la marca vuela desde el splash y las tres líneas del lema suben escalonadas (200 ms); 2 seis barras de espectro crecen desde la base (60 ms de retardo entre ellas), el carril se dibuja de izquierda a derecha, los seis medios saltan con resorte y el anillo se completa; 3 una lente (el ojo de la barra de Leer) recorre el texto y cada afirmación se enciende en el momento en que pasa, con su veredicto; 4 la pregunta aparece, tres puntos de «escribiendo» y la respuesta con citas que saltan una a una; 5 los chips entran con resorte escalonado, al marcarse aparece un check que ensancha el chip (spring) y el contador «3 temas elegidos» sube; 6 tres tarjetas con icono propio; la elegida invierte el icono (tinta), gira 14° con resorte, se despliega una línea de coste y el radio se rellena. Final: el check se dibuja, un anillo verde se expande, 18 fragmentos de papel de los colores del espectro estallan desde el check y caen, y los temas elegidos aparecen como chips en cascada. Con movimiento reducido: sin paralaje, sin fragmentos ni lente, fundidos de 90 ms.
2. **Hoy (M1)** (`Today.tsx`). Antes: título y lista densa. Ahora: marca + botón de actualizar (48) arriba, kicker con la fecha, «Buenos días.» 42 px, subtítulo en cursiva, buscador de 52 px con icono (resultados en desplegable con filas de 56 px), «Tu briefing» con numeración, la primera noticia destacada (25 px, etiqueta «DESTACADA»), barra de posición de 52 px y metadatos de 13 px; temas en chips de 40 px; snackbar oscuro «Compartido desde Telegram» como hoja con resorte sobre la tab bar. Primera carga con esqueleto, luego cascada. Quitado el chip «Tor · ES».
3. **Lectura y análisis (M2)** (`Reading.tsx`, `AnalysisSheet.tsx`). Antes: hoja plana. Ahora: barra con medio y posición (mono 12) y botón de lente (48, oscuro cuando está activa), titular 31 px, banner de IA como tarjeta tocable, texto 18/1,7 con marcas por veredicto; la hoja inferior tiene dos fases: progreso por pasos («Leyendo… Buscando coberturas… Contrastando… Redactando», barra ease-inout, check por paso) y resultado (anillo que se dibuja 900 ms con cuenta). Expandida: segmentado Análisis/Coberturas, afirmaciones con veredicto, enlace a Hemeroteca y «Leer la noticia neutral». Altura animada con spring; sin tab bar.
4. **Agente (M4, M14)** (`Agent.tsx`). Cita con filete azul, burbuja del usuario 16/4, respuesta serif con citas numeradas, fuentes en lista, sugerencias como chips; compositor anclado abajo con sombra superior, modos Preguntar/Verificar/Explicar en chips de 40 px, campo de 52 px redondo y botón de enviar de 52 px.
5. **Síntesis (M3)**. Cabecera de 48 px con segmentado Breve/Completa/Cambios y botón de tema; datos clave, gráficos con barras que crecen con `--m-ease`, voces y posiciones; barra inferior «Pregunta sobre esta noticia» con inset de gestos; tarjeta de fuente (oscura) sube como hoja.
6. **Sin cobertura (M7)**, **Hemeroteca (M6)**, **Historial (M13)**, **Edición sin conexión (M12)**, **Proveedor (M15)**, **404/errores (M9)**, **Tres en raya (M10)**: misma estructura que antes pero con barra superior unificada (back 48 px redondo, título Newsreader 21), insets de estado/gestos con variables, entrada con push de 280 ms, contraste del texto secundario corregido (`#6B675F`), tamaños mínimos de texto 11–12 px, chips y segmentados de 40–48 px y botones de envío/compositor de 52 px. Edición lleva la nueva tab bar. Pendiente en implementación: pasar estas pantallas a las clases `m-*` en vez de estilos en línea.
7. **Ajustes (M8)** (`Settings.tsx`) — rediseño total. Antes: segmentado IA/Red/Fuentes/Bloqueo y rejilla de tarjetas. Ahora: título grande, buscador «Buscar un ajuste» (filtra filas), tarjeta resumen oscura «Tu análisis» (coste, tiempo, pasos en local, barra verde/azul) que abre IA, y grupos con cabecera: Inteligencia artificial (IA y proveedores, Pipeline), Privacidad y red (Conexión, Bloqueo de anuncios), Contenido (Fuentes y posición, Edición sin conexión, solo Wi-Fi), Dispositivos (Emparejar con el PC, Historial), Apariencia (segmentado Papel/Tinta/Sistema), Acerca de, y una **zona de peligro** separada (borde y fondo rojizos, texto rojo: borrar historial, olvidar dispositivo, borrar claves, restablecer) con hoja de confirmación. Cada fila: icono tintado 36, título 16/500, subtítulo 13, valor y chevron (o interruptor). Subpantallas apiladas: IA y proveedores (configuraciones rápidas 2x2, proveedores con interruptor), Pipeline (8 pasos con chip Local/Nube y hoja para elegir proveedor y modelo), Conexión (Directa / VPN / Tor «futuro» desactivado + protecciones), Bloqueo (maestro, contadores que cuentan, listas), Fuentes (espectro, medios con interruptor y balance). Raíz: filas de 60 px, gutter 16, agrupadas en tarjetas de radio 20.
8. **Emparejar (M11)** (`Pair.tsx`). Antes: pasos con vista previa de cámara dibujada. Ahora: intro limpia (ilustración PC↔móvil, 3 garantías, botón de escanear, «código a mano», «importar .npsync»); **escáner a pantalla completa** (vista de cámara oscura, velo con recorte redondeado 260x260, cuatro esquinas de 4,5 px que respiran, línea de escaneo que baja 2,2 s `--m-ease-inout` en bucle, estado «BUSCANDO CÓDIGO»/«CÓDIGO LEÍDO», linterna en la barra superior (48, se rellena al activarla), «Introducir código a mano» abajo → hoja con campo mono de 64 px); **éxito**: esquinas verdes, el QR se centra, círculo verde con check que se dibuja (420 ms) y paso automático a la huella; **permiso denegado**: pantalla propia con icono de cámara tachada, explicación de la ruta en Ajustes de Android, botón «Abrir los ajustes de Android» y alternativa manual; comprobación de huella (3 grupos mono de 30 px, «No coinciden» cancela con aviso); selección de datos con interruptores y progreso por fila. Barra de estado clara sobre el escáner.

   **Animación (v3).** Intro: PC y móvil entran con resorte, una línea discontinua fluye y dos paquetes («QR» y «OK») la recorren en sentidos opuestos (1,5 s, desfasados). Escáner: las cuatro esquinas respiran en secuencia (retardo 0,3 s entre cada una, escala 1→1,08, 2,4 s) en vez de a la vez; la línea baja 2,2 s; el rectángulo discontinuo «buscando» merodea sobre el QR y se afina; **al leer, las esquinas se funden, un marco verde se encaja sobre el QR (resorte), el QR se encoge y el marco se transforma en un círculo (260×260 con radio 30 → 96 con radio 48, 520 ms) y el check se dibuja dentro**. A continuación **apretón de manos** (pantalla nueva, 3,6 s, no cancelable salvo con la X): PC y móvil con una línea entre ambos; paquetes SYN/ACK, luego KEY↔KEY (violeta); un candado aparece en el centro y se **cierra** (el arco gira y baja) cuando se deriva la clave; la línea pasa a azul → violeta → verde sólido; lista de cuatro pasos (X25519, HKDF, XChaCha20, comprobar huella) con puntos que se marcan con un check dibujado. Huella: los tres grupos de 4 dígitos giran (barajan) y se fijan de uno en uno (480, 680 y 880 ms); «Coinciden» pinta la tarjeta con borde verde, un círculo con check en la esquina y la línea de enlace en verde, y pasa a Qué sincronizar a los 900 ms. Alcance: filas en cascada; arriba un enlace PC↔móvil compacto cuyos paquetes van más rápido al sincronizar (el porcentaje junto a él), se detienen y la línea se vuelve verde sólida al terminar; cada fila termina con un check que se dibuja; la tarjeta «Emparejado» salta con resorte. Usar `BarcodeScanner` nativo (p. ej. plugin de Tauri para cámara / ML Kit) con la superposición de la webview por encima.
9. **Tor (M5, hoja de país de salida)**: se conserva como diseño futuro sin cambios. La parte «Conexión» ya no es futuro: ver M21 (punto 13).
10. **Tab bar y movimiento** (`App.tsx`, `mobile.css`): ver arriba.
11. **IA y proveedores (M20)** (`Settings`/`SettingsSub` › IA, hoy solo existe `Provider.tsx` que pide la clave). Pantalla apilada con la misma estructura que Ajustes › IA de escritorio (resumen, «Tus proveedores», punto de partida, gasto, avanzado):
    - Resumen oscuro con tres cifras (coste por noticia, tiempo, pasos en tu equipo) y una barra «en tu equipo / en la nube» que se dibuja (700 ms).
    - Lista **Tus proveedores** (fila 60 px: logo 40, nombre, estado con punto de color y texto honesto: «Conectado · 312 ms», «Sesión iniciada», «En tu red · 3 modelos · 38 ms», «Sin saldo · error 429…», «No responde · último contacto hace 3 h»). Tocar una fila abre la **hoja de proveedor**: estado, clave enmascarada o dirección, pasos que lo usan, **Probar conexión** (el botón se convierte en barra con tres fases «Conectando… / Listando modelos… / Probando respuesta…» y acaba en caja verde «Funciona · 312 ms · 2 modelos» o en caja roja con el error real, código y la acción que corresponde: «Abrir facturación», «Volver a emparejar»), «Cambiar la clave / de cuenta / dirección» y **Desconectar** (botón rojizo → hoja de confirmación que dice qué pasos pasan a otro proveedor). Tras desconectar sale un snackbar «Gemini desconectado · Deshacer» (4,5 s; la clave solo se borra del llavero cuando se descarta el aviso). «Añadir proveedor» abre el asistente.
    - **Punto de partida** como segmentado de 4 (Privacidad, Equilibrado, Calidad, Coste) con una línea de descripción; cambia las tres cifras del resumen.
    - **Gasto**: deslizador 0–50 $ (48 px de alto, 0 = sin límite) y barra «gastado este mes» que pasa a rojo por encima del 80 %.
    - **Avanzado** abre el modelo de cada paso (la parte avanzada de M15, ver abajo). Estado vacío: «Conecta un proveedor» con botón al asistente y «Usar el Ollama de mi PC».
12. **Conectar un proveedor (M15)** (`Provider.tsx`, rehecho como el asistente de escritorio de `ConnectWizard.tsx`; ver el plan «Simplificación de la conexión de proveedores y New Router»). Pantalla completa con barra superior unificada, indicador de 3 segmentos (Elegir · Clave · Prueba) y pie anclado (teclado: el pie y el contenido se acortan, no se solapan; M15 `?s=keykb` y `?s=search` muestran el teclado). Pasos entre sí: push de 280 ms (avanzar entra por la derecha, volver por la izquierda).
    - **Paso 1 «Empieza con uno de estos»**: los tres recomendados del registro (Gemini «Gratis», OpenRouter «Con cuenta», Ollama «Local», este con «PC-ESCRITORIO · 3 modelos · detectado» si hay emparejamiento o «Empareja tu PC para usarlo»), campo «¿Ya tienes una clave? Pégala aquí» con botón Pegar (reconoce el proveedor por el prefijo y muestra «Es de X · Continuar», o avisa de prefijo desconocido), y un único enlace «Ver todos los proveedores (13)».
    - **Lista completa** (pantalla push con «Volver»): buscador de 56 px, **segmentado Abiertos / Cerrados / En tu equipo** con pomo que se desliza (resorte) y una línea que explica el grupo; con texto escrito se busca en todos los grupos y el segmentado se atenúa; filas de 64 px (logo, nombre, una frase, etiquetas Gratis / Con cuenta / Local); fila discontinua «New Router · Próximamente» al principio de Abiertos (no pulsable); al final «¿Tienes tu propio servidor? Conéctalo».
    - **Paso 2**: proveedor en la nube → tarjeta de cabecera, **Iniciar sesión con X** (solo OpenRouter) con estados *idle*, *esperando* (anillo de 5 min que se vacía, «Se ha abierto tu navegador», Copiar enlace, Cancelar) y *error* (rechazado / tiempo agotado / fallo, con Reintentar), separador «o pega una clave», campo mono de 56 px con **Pegar**, línea «Empieza por AIza: es una clave de Gemini» o aviso de prefijo, nota de privacidad de Gemini / de saldo de ChatGPT, acordeón «¿No tienes clave?» con los tres pasos y «Consigue tu clave en …», y la nota del llavero de Android. **Ollama**: si hay emparejamiento, tarjeta «Detectado vía emparejamiento» con equipo, dirección y modelos y sin campos; si no, «Empareja tu PC» (botón a M11) o «Escribir una dirección». **Servidor propio**: Dirección base (teclado `inputmode=url`, nota sobre `localhost` en el móvil), Modelos separados por comas y Clave opcional.
    - **Paso 3a «Probar conexión»**: tres comprobaciones con contador vivo por fila («Conectar con el servidor · 1,2 s», «Listar modelos», «Prueba de respuesta»), ms reales al terminar, chips de modelos que saltan y la burbuja «Listo para leer noticias contigo.». Aviso «Tarda más de lo normal» si pasan 3 s sin respuesta (límite 10 s). **Errores honestos** (cada uno con título, causa, el detalle crudo en mono —código HTTP, tipo, host, ms— y «Qué comprobamos»): *clave* (401), *red* (sin respuesta tras 10 s; recuerda que las llamadas de IA van directas aunque Tor esté activo), *saldo* (429, la clave es válida: interruptor «Guardarla igualmente» y botón a la facturación), *local* (conexión rechazada en 192.168.1.34:11434; menciona `OLLAMA_HOST=0.0.0.0`). Acciones: la principal arregla la causa, «Reintentar», «Copiar detalles».
    - **Paso 3b «Punto de partida»** (`autoAssign`): cuatro opciones tipo radio (Privacidad total, Equilibrado, Máxima calidad, Mínimo coste); la elegida se **despliega** con la asignación por paso (Afirmaciones, Verificación, Neutralidad, Síntesis, Agente: modelo y «tu equipo»/«nube») y tres cifras bajo la lista (coste, tiempo, pasos en tu equipo) que rebotan al cambiar; **límite mensual** con deslizador y cuántas noticias caben; **Opciones avanzadas** (acordeón) con los 8 pasos: tocar uno abre la **hoja de paso** con selector de proveedor (chips), modelos con coste/latencia, **Creatividad** (0–1 en 11 pasos con etiquetas precisa/equilibrada/creativa) e interruptor «Si falla, pasar al modelo local»; Extraer y Buscar coberturas son filas fijas «sin IA». Pantalla final: check, 14 fragmentos, «Gemini está conectado», frase con el coste, «Conectar otro» / «Volver a IA».
13. **Conexión y Tor (M21)** (`ConnectionCard.tsx`; este agente no lo edita, el spec es para quien implemente). Segmentado Directa / Tor (pomo con resorte) y tarjeta que cambia de color por estado (violeta → verde / ámbar / rojo):
    - **Arranque con fases honestas**: porcentaje grande (el que informa arti, nunca inventado), barra con brillo móvil mientras trabaja (**nunca parece congelada**), tiempo transcurrido, nombre de fase en lenguaje llano («Conectando con la red de Tor», «Descargando la lista de relés», «Descargando la información de los relés», «Construyendo un circuito») con una frase de por qué tarda, y lista de las cuatro fases con su tiempo al completarse. Si el porcentaje no cambia 6 s: «sin cambios desde hace 12 s · sigue activo» con punto que late.
    - **«Tarda más de lo normal»** a partir de ~35 s en frío (nota: en redes móviles la primera vez puede llevar varios minutos; las siguientes serán rápidas porque se guarda la lista) con un único enlace «Usar conexión directa mientras tanto». No hay Reintentar ni Restablecer en este estado: solo se espera.
    - **Arranque tibio** (caché reutilizada): fases «Reiniciando Tor · Usando la lista de relés guardada (hace 2 h) · Comprobando que está al día · Construyendo un circuito» y ~8 s en total.
    - **Cambio de red**: tarjeta ámbar «Cambiaste de red: reiniciando Tor» (se conserva el reinicio conservador) que explica por qué el progreso vuelve a 0 % y que será rápido por la caché.
    - **Fallo**: tarjeta roja con la causa real («se quedó en el 44 % durante 1 min 31 s descargando la información de los relés»), detalle crudo en mono (timeout, intentos, % de caché), **Reintentar** (principal), **Usar conexión directa** (secundario) y **Restablecer Tor** (texto, abre una hoja que avisa de que la próxima conexión tardará más porque borra la caché de relés).
    - **Listo**: verde, con tiempo en conectar y «lista de relés nueva / reutilizada», interruptor «Cortar si Tor se cae» y «Restablecer Tor» discreto. **Directa**: tarjeta ámbar con la advertencia de IP.
    - Datos que necesita la UI de `np-net`/`privacy_status` (hoy solo `state` y `percent`): nombre de fase, `startedAt`/`elapsedMs`, `lastProgressAt` (para «sin cambios desde hace…»), `cache: 'cold'|'warm'|'reset'` con edad, motivo de reinicio (`network_change`/`retry`/`reset`) y el error en texto. Sondeo cada 1,5 s solo mientras conecta (ya implementado). Medir arranque en frío y tibio en emulador con red limitada (hspa/edge) y comprobar que la caché se reutiliza tras reiniciar y tras pausa/reanudación es trabajo del lado del código y no está cubierto aquí.

## Cambio aprobado: ojo de la lente (rediseño)

La lente de la barra de Leer (M2, `Movil-Analisis.dc.html`) es un ojo: **abierto** cuando el análisis está activo (fondo tinta) y **cerrado** cuando no (fondo transparente, pupila encogida y pestañas visibles). Morfa el contorno con `d` (CSS, 280 ms `--m-ease-inout`), la pupila hace `scale` con resorte y las pestañas aparecen tras el cierre. Clases en `motion-base.css` (`.m-lens`, `.lid`, `.pupil`, `.lash`); en la app, `IconLens` de `apps/mobile/src/icons.tsx` y las mismas clases en `mobile.css`. El icono `eye` de `Movil-Ajustes` (objeto `IC`) no se usa en ningún artboard y no se ha cambiado.

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

### Checklist del lote v3 (arranque, onboarding, emparejado, proveedores, conexión)

P0
16. Asistente de proveedor móvil (M15) con los tres pasos, pegar clave con detección, prueba con progreso y errores honestos, y `autoAssign` con punto de partida (reutilizar `@newpaper/pipeline`, `detectProviders`, `autoAssign`; la lógica ya existe en `ConnectWizard.tsx`, extraer a un paquete compartido si hace falta). Sin esto el móvil solo permite pegar una clave sin elegir el modelo de cada paso.
17. IA y proveedores (M20): lista con estado real, probar, cambiar y desconectar (con confirmación).
18. Conexión (M21): fases, porcentaje y tiempo honestos y «tarda más de lo normal» a los ~35 s; Reintentar / Directa / Restablecer solo en los estados indicados; datos de fase y caché desde `np-net`.
19. Splash nativo estático (n y rombo fantasma sobre `#17171A`) + `setKeepOnScreenCondition` hasta el primer fotograma del canvas.

P1
20. Intro animada: portar `design/mockups/tools/intro-engine.js` tal cual a `apps/mobile/src/.../Splash.tsx` (un `useEffect` con `requestAnimationFrame`, `<canvas aria-label="...">`, `setTransform(dpr,...)` con dpr <= 2, `NPIntro.hand()` para el iris, modos primer inicio / siguientes / reducido y `prefers-reduced-motion`); aplicar la regla de degradación de `setQuality`; no tocar el primer fotograma (debe seguir siendo idéntico a `drawNative`).
21. Onboarding: paralaje, indicador de segmentos, micro-animaciones por paso, celebración final, vuelo de la marca desde el splash.
22. Emparejado: apretón de manos con paquetes, huella que se revela, marco→círculo con check al leer el QR, enlace PC↔móvil en la sincronización.
23. Punto de partida avanzado y hoja de modelo por paso en móvil (creatividad, respaldo), límite mensual con deslizador.
24. Lista completa de proveedores con buscador y segmentado, fila «New Router · Próximamente».
25. Ollama del PC por emparejamiento: detección en el asistente y estado «No responde» en M20.

P2
26. Deshacer al desconectar (diferir el borrado del llavero).
27. Ajustar el motor de la intro según el rendimiento medido en un dispositivo de gama baja (`setQuality(1|2)` y menos hojas con `navigator.hardwareConcurrency` ≤ 4 o si la media de fotogramas supera 14–20 ms).

## Preguntas abiertas

- Icono: ¿«n.» (elegido) o la alternativa B (solo rombo)? Hay también un fondo liso alternativo (sin reglas de columna).
- Pestañas: ¿mantener «Leyendo» y «Agente» como raíces con lista de sesiones? Los mockups solo muestran sus pantallas de sesión (apiladas, sin tab bar); falta diseñar la raíz de cada una (lista de lo abierto / conversaciones).
- Splash nativo: **¿n fantasma o n blanca?** Para que no haya salto, el splash nativo y el primer fotograma son la marca en gris oscuro (`#34343B`), no blanca. Alternativa: splash con la n blanca y que la intro empiece disolviéndola en hojas durante 150 ms (la n «se desintegra» y vuelve a formarse), más espectacular pero con un fotograma más de ruptura.
- Intro (v4, estilo Balatro): ¿más o menos temblor y franja cromática (tokens en Arranque)? ¿Mantener 4,6 s la primera vez (antes 2,9 s, demasiado rápida en un teléfono real)? Las siguientes son de 1,6 s (se puede saltar tocando). ¿Se prefiere solo la variante corta siempre?
- Texto de New Router y frases cortas de cada proveedor (`providers.hint.*`): las de M15 son provisionales, falta que el autor las revise.
- Gemini: el mockup muestra el aviso de privacidad (Google puede usar lo que envías) en el paso 2; ¿también en la lista completa?
- ¿El snackbar «Deshacer» al desconectar un proveedor es demasiado para una acción poco frecuente? La alternativa es solo la hoja de confirmación.
- Tor en frío: ¿tiene sentido ofrecer «Usar conexión directa mientras tanto» sin más, o conviene mantener bloqueada la lectura hasta que Tor conecte (matiz de privacidad)? El diseño asume que el usuario decide.
- Tema tinta móvil no diseñado todavía.
