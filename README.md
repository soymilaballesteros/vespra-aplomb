# VESPRA — APLOMB

Landing de lujo con dos secciones scroll-driven tipo Apple: el salón gira 360° en el hero
y después se desmonta capa a capa, ambas enganchadas al scroll. No son vídeos: son
secuencias de fotogramas WebP pintadas sobre `<canvas>`.

Maison ficticia creada como demostración. París, 1949. Modelo **Aplomb**, salón de 105 mm.
El gancho: todo el peso pasa por una tapa de nueve milímetros, y lo que lo hace posible es
el **cambrillón**, la lámina de acero templado escondida en la suela. De ahí sale la firma
de la página — una única línea vertical de acero que la recorre entera sin cortarse.

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

## Los dos suelos

La página alterna dos fondos y eso es intencionado: el **escenario** negro donde manda el
producto (hero y anatomía) y el **papel** marfil donde manda el texto (manifiesto, plano,
ficha, casa, colección). Todo el CSS usa una capa semántica (`--bg`, `--fg`, `--accent`…)
definida en `src/styles/tokens.css`; una sección cambia de suelo poniéndose `.on-paper` y
no hay que duplicar ni una regla.

El acento cambia con el suelo a propósito: sobre negro es **acero** (el cambrillón), sobre
marfil es **burdeos**. Un burdeos sobre negro da 3,3:1 de contraste y no pasa AA en
versalitas.

La barra y la espina son fijas, así que `.on-paper` no las alcanza: `src/spine.ts` pone
`chrome-on-paper` en `<html>` según qué sección pasa por detrás de la barra.

## Regenerar los fotogramas

Los vídeos de origen no se versionan (son pesados y regenerables). Para reconstruir
las secuencias hacen falta en `assets/source/`:

- `product-ref.png` — imagen de referencia, 16:9
- `product-rotate.mp4` — rotación 360°, cámara fija, velocidad constante
- `product-explode.mp4` — despiece por capas, cámara fija, movimiento lineal
- opcionales: `atelier-montado.png`, `atelier-cambrillon.png`, `atelier-forrado.png` (4:5)

Los prompts exactos están en `assets/source/PROMPTS.md`, con una regla que no es obvia:
**el zapato tiene que ser más claro que el fondo**, porque el build lo localiza por
luminosidad. Un zapato negro sobre fondo negro rompe la medición.

```bash
pnpm frames
```

El script:

1. Extrae N fotogramas repartidos uniformemente (`rotate` 100, `explode` 120).
2. Mide la caja que ocupa el producto a lo largo de TODO el clip y elige a partir de ella
   el recorte de móvil — nunca el centro del encuadre: la IA no centra el producto.
3. Genera **dos juegos**: `desktop` (hasta 1440 px) y `mobile` (recorte vertical a 720 px).
   Nunca escala por encima del ancho real del origen.
4. Convierte a WebP buscando la calidad que quepa en el presupuesto (de q72 a q48 y, si
   hace falta, bajando resolución). **Presupuesto duro**: desktop ≤ 5 MB, mobile ≤ 2 MB.
5. Deriva el póster del hero, las imágenes de respaldo y los tres retratos del atelier.
   Si existen las tres imágenes propias del atelier las usa; si no, recorta macros de la
   referencia.
6. Escribe `src/frames.manifest.json` con el número REAL de fotogramas.

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
- Que con `prefers-reduced-motion` las secciones pasan a estática y no se descarga ni un
  fotograma.

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

No se usa `scroll-behavior: smooth` en CSS: compite con el scrub de ScrollTrigger y hace
que las secuencias vayan a tirones. El suavizado de los enlaces internos está en `src/nav.ts`.

## Fuera de alcance

Sin CMS: los textos se cambian en `index.html`. Sin páginas legales de cookies,
privacidad ni accesibilidad — harían falta antes de usar esto con un cliente real.
El formulario no tiene backend: solo valida y confirma visualmente.
