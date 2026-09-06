# VESPRA — APLOMB · Prompts de generación

Maison ficticia. París, 1949. Modelo **APLOMB**: salón de tacón de aguja de 105 mm.
Gancho: *todo tu peso pasa por nueve milímetros* — el cambrillón, la lámina de acero
templado escondida en la suela que es lo único que sostiene un tacón de aguja.

Orden: **1) imagen → 2) clip rotación → 3) clip despiece**.
Los dos vídeos usan la MISMA imagen como fotograma inicial (image-to-video).
Eso garantiza que sea literalmente el mismo zapato en las dos animaciones.

---

## Ajustes técnicos

- **Imagen**: 16:9, la máxima resolución que te dé la herramienta.
  Guardar como `assets/source/product-ref.png`
- **Vídeos**: **1080p**, **16:9**, **8-10 segundos**, **sin audio**, modo **image-to-video**
  (la imagen de arriba como primer fotograma).
  Guardar como `assets/source/product-rotate.mp4` y `assets/source/product-explode.mp4`

**Por qué 16:9 y no vertical.** Un salón de perfil es ~1,9 veces más largo que alto; de frente
es estrecho y alto. Durante el giro completo, la caja que ocupa el zapato es la unión de todas
las poses: ~1,9:1, casi exactamente 16:9. En 16:9 a 1080p el zapato conserva ~1.340 px reales
de ancho; en 1:1 solo ~810. El build mide esa caja solo y recorta el móvil a partir de ella.

---

## ⚠︎ La regla que no es obvia: EL ZAPATO TIENE QUE SER MÁS CLARO QUE EL FONDO

El script `scripts/build-frames.mjs` localiza el producto **por luminosidad**: saca el clip en
gris y busca los píxeles que superan 70 sobre 255. El fondo de estudio ronda 4-30 y el producto
tiene que pasar de 90. De ahí salen el recorte de móvil, el encuadre del lienzo y el póster.

**Un zapato negro sobre fondo negro rompe esa medición** y, además, no se vería en la web.
Por eso el APLOMB es de piel color hueso. Si cambias de material, elige uno claro
(hueso, marfil, nude, plata) — nunca negro, ni burdeos oscuro, ni charol negro.

Comprobación rápida antes de dar la imagen por buena: ponla en blanco y negro y baja mucho el
brillo. El zapato entero, **tacón incluido**, tiene que seguir despegándose del fondo.

---

## 1 · IMAGEN DE REFERENCIA

```
Ultra-detailed photorealistic product photograph of a single luxury women's pointed-toe pump,
shot in a professional studio.

THE SHOE: A couture stiletto pump in bone-white nappa calf leather with a soft satin-matte
lustre. A sharply pointed, elongated almond toe. A low, cleanly curved topline that exposes
the arch of the foot. A very slender stiletto heel, 105 mm tall, covered in the same bone
leather, tapering to a small tip. Bone-coloured leather lining just visible at the topline.
The outsole is natural undyed vegetable-tanned leather in a pale honey tone, its edge
burnished by hand — the sole is NOT red and NOT black. No logos, no branding, no hardware,
no buckle, no straps, no platform. Architectural, restrained, Parisian couture — a house
shoe, not a fashion-week prop.

COMPOSITION: One single right shoe, lateral profile view rotated about 20 degrees toward the
camera, standing on the studio floor. Centred in frame, occupying roughly 68% of the image
width, with generous negative space above and below. Camera at product level, straight on,
no tilt, no low angle.

LIGHTING & BACKGROUND: Very dark charcoal-grey seamless studio background, almost black.
Cinematic studio lighting: one large soft key light from the upper left, a cool silver rim
light raking along the topline, the back of the heel counter and the full length of the
stiletto heel so the whole silhouette separates cleanly from the backdrop, and a soft fill.
Deep rich shadows, with a soft contact shadow under the sole. The shoe reads clearly BRIGHTER
than the background across its entire silhouette — including the thin heel, which must never
disappear into the dark.

STYLE: Shot on a Sony A7R IV with a 90mm macro lens. Photorealistic, hyper-realistic, 8k,
extreme detail, visible leather grain and pores, natural colour grading, shallow and constant
depth of field, high-end advertising still. 16:9 aspect ratio. No text, no logos, no watermark,
no people, no props, no reflections of other objects.
```

---

## 2 · CLIP A — ROTACIÓN 360°  (image-to-video con la imagen de arriba)

```
The exact bone-white pump from the reference image, rotating slowly on its vertical axis as if
on an invisible turntable: exactly one full 360-degree revolution that begins and ends in
precisely the same position as the first frame.

The camera is completely static — locked off on a tripod. No zoom, no push-in, no handheld
shake, no parallax, no camera movement of any kind.

The rotation speed is perfectly constant and linear from the first frame to the last: no
ease-in, no ease-out, no acceleration, no pause. The shoe rotates at a mathematically uniform
rate.

The shoe stays exactly the same size in frame throughout, fully inside the frame at all times
with a clear margin on every side — including at the widest pose, when the shoe is seen in full
profile. The slender stiletto heel stays completely visible and fully lit for the entire
revolution; it must never blend into the background or be cut off.

Identical dark charcoal studio background and identical cinematic lighting throughout, with
constant exposure. Cool silver highlights glide smoothly along the topline and down the heel
as the shoe turns.

Photorealistic, extreme detail, single continuous take, no cuts, no flicker, no morphing, no
text, no people.
```

---

## 3 · CLIP B — DESPIECE  (image-to-video con la MISMA imagen)

```
Ultra-detailed macro product video of the exact bone-white pump from the reference image, in one
single continuous take with a completely static locked-off camera.

The shoe begins fully assembled in lateral profile, exactly as in the reference image but sized
to occupy about 45% of the frame width, and holds still for 1 second. Then it slowly opens into
a precise technical exploded view, in the style of an engineering exploded diagram, along one
shared vertical axis, each component floating apart in clean, evenly spaced, compact layers:

  1. the bone nappa leather upper rises first,
  2. then the bone leather lining separates,
  3. then the leather insole lifts away,
  4. then a slender, curved, polished tempered-STEEL SHANK is revealed and floats free — a thin
     mirror-bright metal strip that runs from the ball of the foot to the heel seat, unmistakably
     metal against all the pale leather,
  5. then the natural leather outsole detaches,
  6. and finally the covered 105 mm stiletto heel settles at the bottom.

THE STEEL SHANK IS THE HERO COMPONENT: it must be clearly visible, clearly separate from the
other layers, and clearly metal — cool, reflective, and distinct from the matte bone leather.

Every component stays perfectly aligned on the same axis, evenly spaced, gently floating. The
gaps between layers stay compact so that the ENTIRE exploded assembly remains inside the frame
with a margin at the top and the bottom at every moment — nothing is ever cropped. The motion is
slow, linear and perfectly constant from beginning to end — no easing, no speed changes, no
bounce. The shot ends holding still for 1 second on the fully separated assembly.

The camera never moves: no zoom, no pan, no tilt, no shake. Identical dark charcoal studio
background, identical cinematic lighting and constant exposure throughout. Cool silver
reflections on the leather and a bright specular glint along the steel shank.

Photorealistic, extreme detail, shallow and constant depth of field, single continuous take,
no cuts, no flicker, no text, no people.
```

---

## Cómo revisar los clips antes de darlos por buenos

1. ¿La cámara se queda QUIETA? (si hace zoom o se mueve, el scroll "flota" y se nota)
2. ¿La velocidad es constante? (si acelera o frena, el scrub va a tirones)
3. Rotación: ¿acaba en la MISMA posición en la que empieza?
4. ¿El zapato se mantiene igual todo el clip? (sin morphing ni parpadeos)
5. ¿Se ve entero y con margen en TODAS las poses, incluida la de perfil?
6. ¿El tacón se despega del fondo en todo momento, o hay poses en las que se pierde?
7. Despiece: **¿se ve el cambrillón de acero?** Si no se ve, el clip no vale: es la pieza
   que justifica toda la página.
8. Despiece: ¿el conjunto separado cabe entero en el encuadre, sin cortarse por arriba?

---

## 4 · LAS TRES IMÁGENES DEL ATELIER

Estas tres **sí hacen falta** esta vez. En la web anterior eran macros recortadas del propio
clip y es el punto más flojo que tiene. Formato **4:5 vertical**.
Guardar como `assets/source/atelier-montado.png`, `atelier-cambrillon.png`, `atelier-forrado.png`.
El build las detecta solas: si están, las usa; si no, vuelve a recortar macros de la referencia.

**a) El montado** — `atelier-montado.png`
```
Ultra-detailed photorealistic macro photograph of an artisan's hands stretching bone-white nappa
calf leather over a hand-carved beech shoe last with steel lasting pincers, on a worn wooden
workbench in a dim Parisian atelier. Only the hands and the tool are visible, no face. Cool
silver directional light raking across the pale leather grain, very dark charcoal background.
Shot on a Sony A7R IV, 8k, shallow depth of field, no text, no logos. Vertical 4:5 composition.
```

**b) El cambrillón** — `atelier-cambrillon.png`
```
Ultra-detailed photorealistic macro photograph of a slender curved strip of polished tempered
steel — a shoemaker's shank — resting on a worn wooden workbench beside an unfinished bone-white
leather sole and a small steel hammer. The steel catches a hard specular highlight along its
whole length. Very dark charcoal background, one cool directional light from the upper left,
deep shadows. Shot on a Sony A7R IV, 8k, shallow depth of field, no hands, no people, no text,
no logos. Vertical 4:5 composition.
```

**c) El forrado** — `atelier-forrado.png`
```
Ultra-detailed photorealistic macro photograph of an artisan's hands hand-stitching a bone-
coloured leather lining into the inside of a pale couture pump with a curved needle and waxed
linen thread, in a dim Parisian atelier. Only the hands, the needle and the shoe are visible,
no face. Cool silver light raking across the leather, very dark charcoal background, deep rich
shadows. Shot on a Sony A7R IV, 8k, shallow depth of field, no text, no logos. Vertical 4:5
composition.
```

---

## Variantes de material (si el hueso no te convence)

Cambia solo la línea del material en el prompt de la imagen y repite los clips. Cualquiera de
estas mantiene el contraste que necesita el build:

- **Poudre**: `pale powder-pink satin-finish nappa calf` — la más Dior de las tres.
- **Plata líquida**: `pale liquid-silver metallic nappa calf` — la más fotogénica bajo la luz
  de recorte, pero puede quemar altas luces; baja un punto la intensidad del rim light.
- **Marfil seda**: `ivory silk duchesse satin` — precioso, pero el satén pierde el grano y con
  poco detalle el zoom del hero se nota más.

**No sirven** (rompen la medición por luminosidad y desaparecen sobre el fondo): negro mate,
charol negro, burdeos oscuro, azul noche. Si quieres un zapato oscuro, hay que cambiar también
el fondo del estudio a gris claro — y eso obliga a rehacer el esquema de color de toda la web.
