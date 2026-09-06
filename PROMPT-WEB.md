# Prompt para crear la web

Sustituye lo que va entre corchetes. Pégalo entero en Claude Code, en una carpeta vacía.

---

Construye una landing page de lujo para **[MARCA]**, una [TIPO DE CASA] ficticia, cuyo
producto es **[PRODUCTO]**. El gancho de producto es: **[UNA FRASE QUE LO HAGA ÚNICO]**.

La pieza central es una sección scroll-driven tipo Apple: el producto gira 360° a pantalla
completa en el hero, enganchado al scroll. Y una segunda, más abajo, donde el producto se
despieza mostrando sus capas.

REGLA DE ORO: prohibido usar los vídeos directamente. La técnica es secuencia de
fotogramas WebP sobre `<canvas>` (la de Apple), no un `<video>`.

## Stack
Vite + TypeScript vanilla (sin React ni frameworks), GSAP ScrollTrigger para el pinning,
pnpm. Nada más.

## 0. Antes de empezar, comprueba el entorno
Dime si falta algo de esto antes de continuar: `ffmpeg`, `cwebp`, `node`, `pnpm`.

**Ojo con ffmpeg:** en muchos equipos NO trae encoder WebP. Compruébalo con
`ffmpeg -encoders | grep webp`. Si no está, el pipeline va ffmpeg → PNG → `cwebp`,
nunca `-c:v libwebp`.

**Ojo con pnpm:** si `pnpm install` sale con `ERR_PNPM_IGNORED_BUILDS`, el build fallará
en producción. Fija `"packageManager": "pnpm@11.24.0"` en package.json y ejecuta
`pnpm approve-builds esbuild`. Verifica que `pnpm install --frozen-lockfile` sale con
código 0 antes de dar nada por bueno.

## 1. Assets de origen
Yo te doy tres archivos en `assets/source/`:
- `product-ref.png` — imagen del producto, 16:9, fondo de estudio casi negro
- `product-rotate.mp4` — giro de 360°, cámara fija, velocidad constante
- `product-explode.mp4` — despiece por capas, cámara fija, movimiento lineal

## 2. Pipeline de fotogramas (`scripts/build-frames.mjs`, `pnpm frames`)

1. `ffprobe` para sacar duración y dimensiones. Extrae N fotogramas repartidos de forma
   uniforme (rotación 100, despiece 120).

2. **MIDE DÓNDE ESTÁ EL PRODUCTO en el clip. No asumas que la IA lo centró.**
   Saca el vídeo entero en gris a baja resolución (`scale=192:108,format=gray -f rawvideo`)
   y busca por columna y por fila el píxel más claro: el fondo de estudio ronda 4-30 y el
   producto pasa de 90. Eso te da su caja delimitadora a lo largo de TODO el clip.
   *(Esto es imprescindible: en mi caso el producto ocupaba el 53-63% del ancho y estaba
   desplazado del centro. Un recorte fijo le cortaba los extremos.)*

3. Dos juegos por secuencia:
   - `desktop`: escala a 1440 px de ancho, sin recortar
   - `mobile`: elige el recorte vertical MÁS CERRADO de una lista (1:1, 5:4, 4:3, 3:2, 16:9)
     que contenga el producto con un 6% de margen, **centrado sobre el producto, no sobre
     el encuadre**, y escala a 720 px

4. WebP con búsqueda automática de calidad: empieza en q72 y baja (66, 60, 54, 48) y, si
   hace falta, reduce el ancho, hasta caber en el presupuesto. Falla con error solo si ni
   el suelo cumple.

5. **Presupuesto duro por secuencia:** desktop ≤ 5 MB, mobile ≤ 2 MB. Informe por consola
   con nº de fotogramas, KB medio, KB máximo y total.

6. **Escribe `src/frames.manifest.json`** con el conteo REAL de fotogramas, las dimensiones
   y la caja del producto de cada juego. El runtime lee de ahí. Nunca escribas conteos a
   mano: si el código asume 120 y hay 119, salen 404 y el lienzo se congela.

7. Deriva también el póster del hero **con el mismo recorte que los fotogramas de cada
   juego** (si no, al relevar el lienzo el producto da un salto de tamaño), en dos anchos
   para `srcset`, y las imágenes de respaldo.

## 3. Componente `ScrollSequence` reutilizable

- Sección fijada con ScrollTrigger (`scrub: 0.5`); el progreso 0→1 mapea al fotograma.
- `devicePixelRatio` con tope en 2.
- **Encuadre: llena todo lo posible PERO no recortes nunca el producto.**
  `escala = min(escalaCover, anchoLienzo / anchoProducto, altoLienzo / altoProducto)`,
  centrando sobre el producto. En pantallas verticales sube el producto al 38% de la
  altura para dejar sitio al texto. Rellena el fondo con el color del clip y funde los
  cantos de la imagen con un degradado dibujado en el propio lienzo.
- Repinta solo dentro de `requestAnimationFrame` y solo si cambia el fotograma.
- Precarga progresiva: primero 1 de cada 4, luego el resto.
- **Mientras precarga, pinta el fotograma cargado más cercano** para que el lienzo no se
  quede en negro. **Y CADA CARGA NUEVA DEBE PEDIR REPINTADO mientras el fotograma pintado
  no sea el objetivo.** Si solo lo pides cuando aún no se ha pintado nada, al entrar en la
  sección antes de que cargue nada se pinta una aproximación y el lienzo SE QUEDA AHÍ PARA
  SIEMPRE. Es el fallo más difícil de ver de todos.
- Si el lienzo mide 0×0 (sección oculta o sin layout), no pintes NI marques el fotograma
  como pintado.
- **Cuándo precargar:** solo cuando la sección esté cerca del viewport, el usuario haya
  hecho scroll Y la página haya cargado. Excepción: si la secuencia está en el hero, la
  pasada gruesa entra tras `load` sin esperar al scroll (es lo primero que se ve), pero el
  relleno fino sí espera. Las secuencias no participan nunca de la carga inicial.
- HUD con `?debug=1`: secuencia, juego, fotograma actual, cargados, progreso. Y expón
  `window.__seq()` devolviendo ese estado en JSON, para poder verificar de forma automática.
- Fallback con `prefers-reduced-motion` o si falla la carga: sin pin, imagen estática.

## 4. Trampas que tienes que evitar (me pasaron todas)

- **NO pongas `scroll-behavior: smooth` en CSS.** Compite con el scrub de ScrollTrigger y
  las secuencias van a tirones. Suaviza los enlaces internos por JS.
- **Llama a `ScrollTrigger.refresh()` UNA SOLA VEZ**, cuando las fuentes Y el `load` hayan
  ocurrido. Cada refresh vuelve a medir los pins sobre un documento larguísimo y cuesta
  cerca de un segundo de cálculo de estilos en un móvil modesto. Con dos llamadas sueltas
  el Total Blocking Time se dispara por encima de 1 s de forma intermitente y Lighthouse
  te da 96 en una pasada y 77 en la siguiente.
- **NUNCA pongas una animación de entrada (opacity 0 → 1) sobre el elemento LCP.** El
  elemento no puede pintarse hasta que arranque el JS y termine la transición: en mi caso
  eran 2,3 segundos de render delay.
- **No caches valores de layout (`offsetTop`, `scrollHeight`) en cada frame de scroll.**
  Fuerza un recálculo por frame y dispara el TBT. Mide una vez y recalcula solo en resize.
- **Para ocultar la imagen de respaldo NO te fíes del atributo `hidden`.** Si tienes
  `img { display: block }` en tu CSS base, gana al `display:none` del navegador y la imagen
  aparece pintando su texto alternativo encima de la animación. Ocúltala explícitamente por
  CSS. Con `loading="lazy"` y `display:none` tampoco se descarga.
- **Si ocultas algún elemento decorativo en móvil, quita también el espacio que reservabas
  para él.** Verifica que los márgenes izquierdo y derecho de cada bloque coinciden.

## 5. Estructura de la página
1. **Hero** — la rotación 360° a pantalla completa, fijada (~260vh), con el claim encima.
   El póster va debajo del lienzo: es el LCP y a la vez el respaldo. En apaisado el texto
   se retira con el scroll y deja la pieza sola; en vertical se queda.
2. Manifiesto — 3-4 frases, tipografía grande, mucho aire
3. El taller — 3 bloques imagen + texto sobre el proceso
4. **Anatomía** — el despiece (fijado ~400vh) con 4 hitos sincronizados al progreso
5. Ficha técnica — tabla sobria
6. Historia — línea temporal con 4-5 hitos, años en serif grande
7. La colección — 3 variantes
8. Edición limitada — numeración + formulario mínimo (nombre, email, sin backend)
9. Pie mínimo

## 6. Diseño
Fondo casi negro, un acento cálido, tipografía display con carácter + una grotesca neutra
para la interfaz, **ambas auto-alojadas** (cero peticiones a terceros). Espacios generosos,
animaciones sobrias.

Elige un elemento con firma propia que signifique algo del producto, y que sea lo único
llamativo de la página. Todo lo demás, disciplinado.

No uses: rótulos en versalitas encima de un titular (el titular se sostiene solo),
numeración de secciones si no son una secuencia real, ni tarjetas iguales como estructura.

## 7. Criterios de aceptación — verifícalos tú, no me los des por buenos

**A) LA ANIMACIÓN SE VE.** Con un script de navegador (Playwright), contra el build de
producción, no el de desarrollo:
- Scroll programático **instantáneo** (`behavior: 'instant'`) al 0/25/50/75/100% del rango
  de cada sección, esperando a que el scrub se asiente.
- En cada parada, calcula un **hash de los píxeles del lienzo** (dibújalo en un canvas de
  24×14 y haz FNV sobre los bytes). Las 5 huellas deben ser DISTINTAS. No te fíes de mirar
  las capturas.
- Comprueba que **el fotograma objetivo coincide con el pintado** en los 5 puntos. Si no
  coincide, tienes el fallo del repintado descrito arriba.
- Baja y vuelve a subir: las huellas deben coincidir con las de la ida.
- Cero errores de consola y cero respuestas 404.
- Repite todo en 1440×900 y en 390×844.

**B) RENDIMIENTO.**
- Carga inicial antes de hacer scroll < 1 MB, y **cero peticiones de fotogramas**.
- El LCP debe ser el póster o un texto, nunca un fotograma de secuencia.
- Lighthouse ≥ 95 en escritorio y ≥ 95 en móvil. **Ejecútalo dos veces**: si una pasada da
  mucho menos que la otra, tienes un pico de TBT intermitente, no varianza.

**C) MÓVIL.** Mide los márgenes izquierdo y derecho de cada bloque de contenido: tienen que
coincidir. Cero elementos desbordados. Zonas táctiles ≥ 44 px.

**D) FALLBACK.** Con `prefers-reduced-motion`, las secciones se vuelven estáticas, muestran
su imagen y no descargan ni un fotograma.

Si algo de esto falla, diagnostícalo y arréglalo antes de seguir. No me digas que está
terminado sin haber ejecutado estas comprobaciones y enseñarme los resultados.
