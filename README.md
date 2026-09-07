# VESPRA — APLOMB

Landing de lujo scroll-driven tipo Apple: el salón gira 360° en el hero y una mujer cruza
la pantalla con él al ritmo del scroll. No son vídeos: son secuencias de fotogramas WebP
pintadas sobre `<canvas>`. La anatomía es una **cámara sobre fotos** que se acerca a cada
parte del zapato, hay una macro de la punta que se acerca al bajar y un alzado técnico en
SVG que se traza solo.

Maison ficticia creada como demostración. París, 1949. Modelo **Aplomb**: salón de pitón
natural de 120 mm con la suela lacada en rojo. Dos ganchos: todo el peso pasa por una tapa
de nueve milímetros (lo sostiene el **cambrillón**, la lámina de acero escondida en la suela),
y el rojo de la suela solo se ve cuando la mujer se va. De ahí sale la firma de la página:
una única línea vertical roja, el filo de la suela, que la recorre entera sin cortarse.

## Estado del material

Las dos secuencias (`rotate`, `walk`) están construidas con los clips reales y el manifest
(`src/frames.manifest.json`) lleva sus conteos. **No hay clip de despiece**: la Anatomía y
la Ficha técnica van con la cámara sobre fotos (`src/camera.ts`), que recorre el perfil
maestro, las vistas frontal y trasera del giro y la foto del acero del atelier. Los prompts
siguen en `assets/source/PROMPTS.md` por si hay que regenerar algo.

## Requisitos

- Node 20+ y **pnpm**
- **ffmpeg** y **cwebp** (solo para regenerar los fotogramas)
  - macOS: `brew install ffmpeg webp`
  - Ojo: el ffmpeg de este equipo no trae encoder WebP, por eso el pipeline pasa por `cwebp`.
- **Chromium de Playwright** (solo para `pnpm verify`): `pnpm exec playwright install chromium`

## Puesta en marcha

```bash
pnpm install
pnpm dev          # desarrollo
pnpm build        # producción -> dist/
pnpm preview      # sirve dist/ en el puerto 4173
pnpm verify       # comprobaciones de navegador contra el build de producción
```

## Un solo suelo

La página es un papel crema de arriba abajo y el producto es lo único que tiene color. El
único acento es el **rojo de la suela**, y se gasta en muy pocos sitios: la espina, el hito
activo, el foco del formulario y el trazo del cambrillón en el plano. Todo el CSS usa una
capa semántica (`--bg`, `--fg`, `--accent`…) definida en `src/styles/tokens.css`.

El escenario de las secuencias no es un color escrito a mano: es el crema REAL del ciclorama,
que el build mide del clip y guarda en el manifest (`background`). Por eso los clips tienen
que rodarse sobre crema (`#EDE4D6`), no sobre blanco: un fondo blanco dejaría una caja sobre
la página.

## Regenerar los fotogramas

Los vídeos de origen no se versionan (son pesados y regenerables). Para reconstruir
las secuencias hacen falta en `assets/source/`:

- `product-ref.png` — imagen maestra, 16:9 (de ella salen el perfil de la cámara y las macros)
- `product-rotate.mp4` — giro 360°, cámara fija, velocidad constante
- `product-walk.mp4` — la mujer cruza el encuadre de izquierda a derecha, cámara fija
- `detail-toe.png` — macro de la punta (La punta)
- `hero-backdrop.png` — el fondo del hero: papel crema con luz suave, 16:9 (sale a 1280 px,
  es un degradado liso)
- opcionales: `atelier-montado.png`, `atelier-cambrillon.png`, `atelier-laca.png` (4:5).
  La del cambrillón hace doble trabajo: es también el plano del acero en la Anatomía.

Los prompts exactos están en `assets/source/PROMPTS.md`, con una regla que no es obvia:
**el zapato tiene que separarse del fondo por contraste**, porque el build lo localiza así.
Y el fondo tiene que ser crema, no blanco.

```bash
pnpm frames                  # las tres
pnpm frames --only rotate    # solo una
```

El script:

1. Extrae N fotogramas repartidos uniformemente (`rotate` 160, `walk` 160). El paso se
   corta donde la mujer sale del encuadre (`clip: 'exit'`): si no, el final del scroll
   era medio segundo de ciclorama vacío.
2. Mide la caja que ocupa el producto a lo largo de TODO el clip y elige a partir de ella
   el recorte — nunca el centro del encuadre: la IA no centra el producto. En el paso no
   recorta (`tight: false`): el sujeto es el encuadre entero. Del giro saca además las
   vistas **frontal** y **trasera** (los fotogramas más estrechos de cada media vuelta,
   distinguidos por lo que toca el suelo: la punta entera o solo la tapa) para la cámara
   de la anatomía.
3. Genera **dos juegos**: `desktop` (hasta 1920 px) y `mobile` (recorte vertical a 960 px).
   Nunca escala por encima del ancho real del origen.
4. Convierte a WebP buscando la calidad que quepa en el presupuesto (de q82 a q58 y, si
   hace falta, bajando resolución). **Presupuesto duro**: desktop ≤ 9 MB, mobile ≤ 3 MB
   (12 y 4 MB para las secuencias con alfa: el giro). Las secuencias `cut` pasan por
   ffmpeg → RGBA en bruto → relleno de agujeros en Node → PAM → cwebp.
5. Deriva el póster del hero, las imágenes de respaldo, los tres retratos del atelier, la
   macro de la punta y las fotos de la cámara (`anatomy-*.webp`). Si existen las tres
   imágenes propias del atelier las usa; si no, recorta macros de la referencia. Mide el
   crema del ciclorama de la maestra (`images.studio`) para el marco de la cámara.
6. Escribe `src/frames.manifest.json` con el número REAL de fotogramas, y borra la marca
   `placeholder` de cada secuencia construida.

> El manifest es lo que evita el fallo clásico de esta técnica: si el código asume 120
> fotogramas y solo hay 119, salen 404 y el canvas se queda congelado. Los conteos
> vienen siempre del build, nunca escritos a mano.

## Verificación

`pnpm verify` levanta el build de producción y comprueba en Chromium, a 1440×900 y a
390×844, lo que Lighthouse no puede ver:

- **Que la animación avanza de verdad.** Hace scroll instantáneo al 0/25/50/75/100 % del
  recorrido de cada secuencia y compara una **huella de los píxeles del lienzo**. Si las
  cinco coinciden, el lienzo está congelado aunque las capturas salgan bien. En las
  cámaras sobre fotos la huella es el plano activo más su `transform`.
- Que el fotograma pintado coincide con el objetivo en los cinco puntos.
- Que la vuelta reproduce las mismas huellas que la ida.
- Que las secuencias no participan de la carga inicial y que antes del primer scroll solo
  carga la pasada gruesa del hero.
- Que el LCP no es el lienzo.
- Que todos los bloques cuelgan del mismo raíl, y que en móvil los márgenes coinciden.
- Que ninguna imagen está rota. *(Esta hace falta porque `vite preview` responde 200 con
  el index.html a rutas que no existen: un fichero que falta no sale como 404.)*
- Que los `width`/`height` declarados en cada `<img>` tienen la proporción de la imagen real.
- Que con `prefers-reduced-motion` las secciones pasan a estática y no se descarga ni un
  fotograma.

Las secuencias con material provisional se saltan con un aviso, no con un fallo.

`node scripts/shots.mjs <carpeta>` hace una captura por sección, en escritorio y en móvil,
para la ronda de inspección visual.

Lo que **no** cubre: Lighthouse. Ejecútalo dos veces en móvil y en escritorio; si una
pasada da mucho menos que la otra, es un pico de TBT intermitente, no varianza.

## Depuración

Abre cualquier página con `?debug=1` y aparece un HUD con la secuencia, el juego
(desktop/mobile), el fotograma actual, cuántos van cargados y el progreso.

Desde la consola, `window.__seq()` devuelve el mismo estado en JSON.

## Cómo funciona el scroll

`src/scroll-sequence.ts` es el componente que usan las dos secciones:

- GSAP ScrollTrigger fija la sección y mapea el progreso 0→1 al índice de fotograma.
- Encuadra llenando todo lo posible **pero sin recortar nunca el producto**, y funde los
  cuatro cantos con el color del clip.
- Repinta solo dentro de `requestAnimationFrame` y **solo si cambia el fotograma**.
- Precarga progresiva: primero 1 de cada 4 fotogramas, luego el resto.
- Arranca solo cuando **(a)** la sección se acerca al viewport, **(b)** el usuario ha
  hecho scroll y **(c)** la página ha terminado de cargar. Excepción: el hero hace su
  pasada gruesa tras `load` sin esperar al scroll, porque es lo primero que se ve.
- Si el fotograma exacto aún no está, pinta el más cercano ya cargado, y cada carga nueva
  pide repintado mientras el pintado no sea el objetivo: el canvas nunca se queda clavado.
- Con `prefers-reduced-motion` o si la carga falla, la sección no se fija: pasa a altura
  normal con imagen estática y textos.

`src/plan.ts` traza el alzado técnico de la sección "El plano" con el scroll. La sección
está anclada con `sticky` (un carril de 240svh y un pin de 100svh): el dibujo, a todo el
ancho que le deja la cabecera, se queda en pantalla mientras se traza y las cotas salen a
la vista. Debajo va la foto de perfil recortada del fondo, que se disuelve. El estado por
defecto del SVG es **dibujado**: es el JS quien lo esconde, así que sin JS o con
reduce-motion el plano se ve entero.

`src/atelier.ts` mueve el atelier: tres paneles a pantalla completa (foto a sangre, texto
sobre una banda crema, número en rojo) que se desplazan en horizontal al ritmo del scroll,
con un paralaje leve en la foto. Anclaje `sticky`, solo `transform`. En vertical y con
reduce-motion los paneles se apilan y no hay carril.

`src/detail.ts` acerca la macro de "La punta" con el scroll. El anclaje es `position:
sticky`, no un pin: un pin añade altura al documento al crearse y desplaza todo lo que
hay debajo (las marcas de la espina, por ejemplo).

`src/camera.ts` es la **cámara sobre fotos** (Anatomía y Ficha técnica). Un marco fijo,
varias fotos apiladas y un scrub que mueve el objetivo: cada `<img class="cam__layer">`
es un plano con su punto de interés y su zoom (`data-from="x,y,z"`, `data-to`), y entre
plano y plano la foto siguiente entra en fundido sobre la anterior. Solo se animan
`transform` y `opacity`; el anclaje es `sticky`, como en la punta. `data-fit="contain"`
enseña la foto entera cuando no llena el marco (la ficha, en columna vertical) y el
marco es del crema real del ciclorama, medido por el build. Sin JS o con reduce-motion
se ve la primera foto quieta.

Encuadre por secuencia (`data-fill`): `subject` dimensiona el producto a una fracción del
lienzo y rellena el resto con el crema del set (giro, despiece); `cover` llena el lienzo
como `object-fit: cover` (el paso, donde la mujer recorre el encuadre entero).
`data-fill-x` / `data-fill-y` ajustan esa fracción por sección.

## El zapato en todas las secciones

Los mismos fotogramas se reutilizan por tramos, sin fijar la sección (`data-pin="none"`,
`data-range="a,b"`): la columna del zapato es `sticky` y el scrub recorre la altura del
texto. Solo se precargan los fotogramas del tramo. (El manifiesto, que giraba un cuarto de
vuelta al lado del texto, se quitó el 2026-09-06 a petición de Mila.)

- Anatomía: cámara sobre cuatro fotos; cada hito es un plano (la pala en el perfil, el
  forro y la palmilla en la vista frontal, el cambrillón en el acero del atelier, el tacón
  y la suela en la vista trasera), con una marca roja sobre el punto.
- Ficha técnica: anclada; la misma cámara sigue a la fila. Cada fila es un hito y un plano
  de la foto maestra (`data-shots`): la fila activa se enciende y el objetivo va a la parte
  de la que habla (la tapa, el cambrillón, la piel, el forro, la suela…).
- La casa: el giro entero es el FONDO, a pantalla completa y velado, y los años van sobre
  un camino curvo rojo que se traza con el scroll (`src/heritage.ts`); cada año se
  enciende cuando el trazo llega a su punto.
- La colección: anclada; el scroll pasa de una piel a otra (`src/collection.ts`). Detrás,
  el nombre de la variante en letras enormes; en el centro el zapato recortado, vestido
  por filtros; a la izquierda las tres, y solo la activa despliega su ficha. Tocar una
  lleva el scroll a su tramo. En vertical, lista y toque.
- Solicitar un par: el segundo tramo del paso (la mujer se va por la derecha) es el fondo
  del formulario y avanza mientras bajas. «El rojo que solo ves cuando se va.»

Las secuencias sin pin admiten `data-start` / `data-end` (sintaxis de ScrollTrigger) para
decir dónde empieza y acaba su scrub: la casa va de `top top` a `bottom bottom` (sticky) y
la cita de `top 70%` a `bottom bottom`.
- El plano: la foto de perfil (`still-profile.webp`, el fotograma más ancho del giro) se
  disuelve mientras el dibujo se traza. Si el clip tiene el talón a la izquierda, el build
  lo anota en `images.profile.flip` y `plan.ts` la voltea.
- Colección: un solo zapato recortado del fondo (`still-profile-cut.webp`, por clave de
  color) que cambia de piel con filtros CSS al señalar cada variante.
- Hero: portada. Detrás de todo, la foto del papel con luz (`hero-backdrop.webp`, 4 KB, a
  sangre). Los fotogramas del giro van RECORTADOS del fondo (`cut: true` en el build:
  clave de color sobre el crema medido + relleno de agujeros, porque la clave se comía las
  escamas crema) y el lienzo del hero es transparente (`data-transparent`), así que el
  zapato gira ENTRE las dos líneas del titular: la primera detrás, la segunda delante (una
  copia del titular por encima del lienzo con la primera línea invisible). El titular va a
  lo grande y con el scroll se abre hacia los lados (`--hero-split`); la entradilla abajo a la
  izquierda; un suelo rojo que se traza al cargar con tres apuntes (el del centro es la
  invitación a bajar); el ratón mueve el titular unos píxeles (`--mx/--my`); y cuatro notas
  alrededor del zapato que entran con el giro (`data-from`) y se quedan
  (`data-beats="accumulate"`). El titular sigue sin animación de entrada: es el LCP.

Con material provisional (`frames: 0, placeholder: true` en el manifest), una sección con
hitos conserva el pin y la coreografía del texto sobre su foto de respaldo.

No se usa `scroll-behavior: smooth` en CSS: compite con el scrub de ScrollTrigger y hace
que las secuencias vayan a tirones. El suavizado de los enlaces internos está en `src/nav.ts`.

## Fuera de alcance

Sin CMS: los textos se cambian en `index.html`. Sin páginas legales de cookies,
privacidad ni accesibilidad — harían falta antes de usar esto con un cliente real.
El formulario no tiene backend: solo valida y confirma visualmente.
