# VESPRA — APLOMB

Landing de lujo con tres secciones scroll-driven tipo Apple: el salón gira 360° en el hero,
una mujer cruza la pantalla con él al ritmo del scroll y después se desmonta capa a capa.
No son vídeos: son secuencias de fotogramas WebP pintadas sobre `<canvas>`. Además, una
macro de la punta que se acerca al bajar y un alzado técnico en SVG que se traza solo.

Maison ficticia creada como demostración. París, 1949. Modelo **Aplomb**: salón de pitón
natural de 120 mm con la suela lacada en rojo. Dos ganchos: todo el peso pasa por una tapa
de nueve milímetros (lo sostiene el **cambrillón**, la lámina de acero escondida en la suela),
y el rojo de la suela solo se ve cuando la mujer se va. De ahí sale la firma de la página:
una única línea vertical roja, el filo de la suela, que la recorre entera sin cortarse.

## Estado del material

Las tres secuencias están marcadas como **provisionales** en `src/frames.manifest.json`
(`frames: 0, placeholder: true`): la web se ve con las fotos de referencia, estática, hasta
que existan los clips. Los prompts y los ajustes exactos están en `assets/source/PROMPTS.md`.
Cuando haya un clip, `pnpm frames --only <rotate|walk|explode>` lo convierte y esa sección
pasa a animarse; las demás siguen con su foto.

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

- `product-ref.png` — imagen maestra, 16:9
- `product-rotate.mp4` — giro 360°, cámara fija, velocidad constante
- `product-walk.mp4` — la mujer cruza el encuadre de izquierda a derecha, cámara fija
- `product-explode.mp4` — despiece por capas, cámara fija, movimiento lineal
- opcionales: `atelier-montado.png`, `atelier-cambrillon.png`, `atelier-laca.png` (4:5)

Los prompts exactos están en `assets/source/PROMPTS.md`, con una regla que no es obvia:
**el zapato tiene que separarse del fondo por contraste**, porque el build lo localiza así.
Y el fondo tiene que ser crema, no blanco.

```bash
pnpm frames                  # las tres
pnpm frames --only rotate    # solo una
```

El script:

1. Extrae N fotogramas repartidos uniformemente (`rotate` 160, `walk` 160, `explode` 120).
2. Mide la caja que ocupa el producto a lo largo de TODO el clip y elige a partir de ella
   el recorte — nunca el centro del encuadre: la IA no centra el producto. En el paso no
   recorta (`tight: false`): el sujeto es el encuadre entero.
3. Genera **dos juegos**: `desktop` (hasta 1920 px) y `mobile` (recorte vertical a 960 px).
   Nunca escala por encima del ancho real del origen.
4. Convierte a WebP buscando la calidad que quepa en el presupuesto (de q82 a q58 y, si
   hace falta, bajando resolución). **Presupuesto duro**: desktop ≤ 9 MB, mobile ≤ 3 MB.
5. Deriva el póster del hero, las imágenes de respaldo y los tres retratos del atelier.
   Si existen las tres imágenes propias del atelier las usa; si no, recorta macros de la
   referencia.
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
  cinco coinciden, el lienzo está congelado aunque las capturas salgan bien.
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

`src/plan.ts` traza el alzado técnico de la sección "El plano" con el scroll. El estado
por defecto del SVG es **dibujado**: es el JS quien lo esconde, así que sin JS o con
reduce-motion el plano se ve entero.

`src/detail.ts` acerca la macro de "La punta" con el scroll. El anclaje es `position:
sticky`, no un pin: un pin añade altura al documento al crearse y desplaza todo lo que
hay debajo (las marcas de la espina, por ejemplo).

Encuadre por secuencia (`data-fill`): `subject` dimensiona el producto a una fracción del
lienzo y rellena el resto con el crema del set (giro, despiece); `cover` llena el lienzo
como `object-fit: cover` (el paso, donde la mujer recorre el encuadre entero).
`data-fill-x` / `data-fill-y` ajustan esa fracción por sección.

## El zapato en todas las secciones

Los mismos fotogramas se reutilizan por tramos, sin fijar la sección (`data-pin="none"`,
`data-range="a,b"`): la columna del zapato es `sticky` y el scrub recorre la altura del
texto. Solo se precargan los fotogramas del tramo.

- Manifiesto: giro, tramo 0.45→0.72 (un cuarto de vuelta).
- Ficha técnica: despiece al revés, 1→0 (el zapato se monta mientras lees).
- La casa: giro, tramo 0.72→1 (cierra la vuelta).
- El plano: la foto de perfil (`still-profile.webp`, el fotograma más ancho del giro) se
  disuelve mientras el dibujo se traza. Si el clip tiene el talón a la izquierda, el build
  lo anota en `images.profile.flip` y `plan.ts` la voltea.
- Colección: un solo zapato recortado del fondo (`still-profile-cut.webp`, por clave de
  color) que cambia de piel con filtros CSS al señalar cada variante.
- Hero: cuatro notas alrededor del zapato que entran con el giro (`data-from`) y se quedan
  (`data-beats="accumulate"`).

Con material provisional, las secciones con hitos (hero, anatomía) conservan el pin y la
coreografía del texto sobre la foto de referencia.

No se usa `scroll-behavior: smooth` en CSS: compite con el scrub de ScrollTrigger y hace
que las secuencias vayan a tirones. El suavizado de los enlaces internos está en `src/nav.ts`.

## Fuera de alcance

Sin CMS: los textos se cambian en `index.html`. Sin páginas legales de cookies,
privacidad ni accesibilidad — harían falta antes de usar esto con un cliente real.
El formulario no tiene backend: solo valida y confirma visualmente.
