# VESPRA — APLOMB · Prompts de generación

Maison ficticia. París, 1949. Modelo **Aplomb**: salón de pitón natural, 120 mm, suela lacada
en rojo. El zapato es el **Louboutin Pigalle 120 en pitón** tal cual: las cinco fotos de
referencia están en `assets/source/ref/` (no se versionan). La casa sigue siendo ficticia:
**nada de logos, nada de texto en la plantilla, nada de la palabra Pigalle.**

Dos ganchos que solo tiene este zapato, y que son lo que enseña la web:
- **Nueve milímetros tocan el suelo**: la tapa. Lo sostiene el cambrillón de acero.
- **El rojo que solo ves cuando se va**: la suela, que asoma al levantar el talón.

Orden: **1) imagen maestra → 2) giro → 3) paso → 4) despiece → 5) macro de la punta →
6) atelier**. Los clips del giro y del despiece usan la MISMA imagen maestra como fotograma
inicial (image-to-video): así es literalmente el mismo zapato en las dos animaciones.

---

## Ajustes técnicos

| Asset | Formato | Archivo |
|---|---|---|
| Imagen maestra | **16:9**, máxima resolución (mín. 1920×1080) | `assets/source/product-ref.png` |
| Clip giro 360° | **16:9**, 1920×1080, **10 s a 24 fps o más** | `assets/source/product-rotate.mp4` |
| Clip paso | **16:9**, 1920×1080, 10 s, 24 fps o más | `assets/source/product-walk.mp4` |
| Clip despiece | **16:9**, 1920×1080, mismos ajustes | `assets/source/product-explode.mp4` |
| Macro de la punta | 1:1 o 4:5, mín. 1600 px de lado | `assets/source/detail-toe.png` |
| 3 macros del atelier | 4:5 vertical, 1200×1500 | `assets/source/atelier-{montado,cambrillon,laca}.png` |

Cuando estén: `pnpm frames` (o `pnpm frames --only rotate` si solo tienes uno), `pnpm build`,
`pnpm verify`. El build mide el zapato, recorta, genera los WebP y sustituye solo el material
provisional: mientras un clip no esté, esa sección sigue con la foto de referencia.

**16:9 y no vertical.** Un salón de perfil es ~1,9 veces más largo que alto. Durante el giro, la
caja que ocupa es la unión de todas las poses: ~1,9:1, casi 16:9.

**Mínimo 200 fotogramas de origen.** El build extrae 160 del giro y del paso. Un clip de 5 s a
24 fps solo tiene 120: al pedir 160 se repetirían y el scroll daría tirones. 10 s a 24 fps van
sobrados.

---

## ⚠︎ Las dos reglas que deciden si el material sirve

### 1 · El zapato tiene que llenar el 85 % del ancho (giro y despiece)

Cada píxel de fondo vacío es un píxel que el lienzo tiene que ampliar después. `pnpm frames`
avisa si baja del 70 %. En el paso NO aplica: ahí el sujeto es la mujer cruzando el encuadre.

### 2 · El zapato tiene que separarse del fondo por contraste

El build localiza la pieza midiendo su **contraste contra el fondo**, y de ahí salen el recorte,
el encuadre y el póster. Pitón rojo y negro sobre crema se separa de sobra; lo único que se
puede perder es el **tacón**, fino y a contraluz. Por eso el prompt pide luz de contorno sobre
él. Comprobación: pon la imagen en blanco y negro y sube el contraste; el contorno entero,
tacón incluido, tiene que seguir leyéndose.

**El fondo tiene que ser crema, no blanco.** La web es de papel crema (`#F1EAE0`) y el lienzo
rellena alrededor del fotograma con el color que mide del clip. Un ciclorama blanco puro
dejaría una caja blanca sobre la página. Pide `#EDE4D6` (un punto más oscuro que el papel:
en cámara sube).

---

## 1 · IMAGEN MAESTRA

Image-to-image o generación con referencia. Adjunta las cinco fotos de `ref/`, y sobre todo
`ref-profile.jpg` (perfil) y `ref-back.jpg` (talón y suela).

```
Editorial product photograph of a single pointed-toe pump in natural python skin, exactly
like the reference images: scales in deep red, black and cream arranged in the python's own
pattern, a 120mm slender stiletto heel wrapped in the same python, a red kidskin lining,
and a glossy lacquered red leather sole. Three-quarter view from slightly behind and
above: the heel toward the camera on the right, the toe angled away to the left, so that
the red sole edge and the heel are both visible. No brand text anywhere, plain lining.

Studio: infinite cyclorama in warm cream (#EDE4D6), smooth vertical falloff, no visible
horizon line. Lighting: one large soft key at 45 degrees upper left, faint warm bounce
from the right, and a narrow rim light from behind tracing the topline of the vamp and
the full length of the stiletto heel, so the whole silhouette separates from the cream,
the heel included. Crisp specular highlight along the python scales — real skin, not
plastic. Soft contact shadow fading within 4cm, no mirror floor.

Shot on 120mm equivalent, camera at shoe height, shallow compression, no wide-angle
distortion. The shoe fills 85% of the frame width. Muted, quiet, expensive. No props, no
flowers, no marble, no fabric, no smoke, no second shoe, no text, no logo. Photographic,
not CGI. 16:9, extremely sharp, individual scales visible.
```

---

## 2 · CLIP A — GIRO 360° (image-to-video con la imagen maestra)

```
The exact python pump from the reference image, rotating slowly on its vertical axis as if
on an invisible turntable: exactly one full 360-degree revolution that begins and ends in
precisely the same position as the first frame.

The camera is completely static — locked off on a tripod. No zoom, no push-in, no
handheld shake, no parallax, no camera movement of any kind.

The rotation speed is perfectly constant and linear from the first frame to the last: no
ease-in, no ease-out, no acceleration, no pause.

The shoe stays exactly the same size in frame throughout and never leaves the frame. In
its widest pose — full profile — it fills 85% of the frame width with a clear margin at
both sides. When the sole faces the camera, the lacquered red sole is fully visible and
glossy. The slender python heel stays lit and separated from the cream background for
the entire revolution.

Identical warm cream cyclorama and identical lighting throughout, with constant exposure.
The specular highlight glides smoothly across the scales as the shoe turns. The scale
pattern is fixed to the shoe: it never drifts, morphs or re-arranges.

Photorealistic, extreme detail, single continuous take, no cuts, no flicker, no text, no
people, no brand markings.
```

---

## 3 · CLIP B — EL PASO (text-to-video con `ref-walk.jpg` como referencia)

Es la sección nueva: la mujer cruza la pantalla **al ritmo del scroll**. Lo que importa es que
entre por un lado y salga por el otro con la cámara clavada, y que la suela roja asome a cada
paso. Y que el **tercio superior del encuadre quede vacío**: ahí va el texto de la web.

```
Fashion film, single static shot. A woman in a charcoal grey wool midi skirt with a back
slit, bare legs, wearing red-black-cream natural python stiletto pumps with a 120mm heel
and a lacquered red sole — exactly the shoes in the reference image. She walks at an
unhurried, even pace from the far left edge of the frame to the far right edge, seen from
behind at a slight three-quarter angle so that at every step the lifted heel reveals the
glossy red sole.

Framing: camera locked off on a tripod at ankle height, 16:9, showing her from just above
the knee down to the floor. Her feet travel along the lower third of the frame; THE UPPER
THIRD OF THE FRAME IS EMPTY CREAM BACKGROUND at all times. She enters from outside the
left edge and exits past the right edge, without stopping, turning or slowing down; her
stride is regular and the walk is continuous. No other people, no props.

Setting: infinite warm cream cyclorama (#EDE4D6) with a soft vertical falloff, seamless
floor, one large soft key light from the upper left, a faint rim light from behind so the
heels separate from the background, soft contact shadows under the shoes.

Photorealistic, natural skin, real fabric movement in the skirt, extreme detail on the
python scales and the red sole. Constant exposure, no camera movement, no zoom, no cuts,
no slow motion, no flicker, no text, no logos. 10 seconds.
```

Si la herramienta admite fotograma inicial y final: el inicial es la mujer entrando por la
izquierda (solo se ve un pie) y el final saliendo por la derecha. Así el clip no "respira".

---

## 4 · CLIP C — DESPIECE (image-to-video con la MISMA imagen maestra)

```
Ultra-detailed macro product video of the exact python pump from the reference image, in
one single continuous take with a completely static locked-off camera.

The shoe begins fully assembled in lateral profile, sized to occupy about 55% of the frame
width, and holds still for 1 second. Then it opens into a precise technical exploded view
along one shared vertical axis, each component floating apart in clean, evenly spaced
layers, in this order and staggered — each piece starts moving slightly after the
previous one, never all at once:

  1. the python upper rises and opens up and to the left, its scale pattern intact,
  2. the red kidskin lining slides out behind it,
  3. the leather insole lowers,
  4. a slender curved POLISHED STEEL SHANK slides toward the viewer and hangs suspended
     in the centre — a thin mirror-bright metal strip, unmistakably metal against the
     python and the leather,
  5. the python-covered stiletto heel lowers and rotates about 15 degrees,
  6. the leather outsole settles at the bottom, its lacquered RED underside turned
     slightly toward the camera so the red is clearly visible.

THE STEEL SHANK IS THE HERO COMPONENT: clearly visible, clearly separate, clearly metal.

Maximum separation is 1.4 times the length of the shoe. The whole exploded assembly stays
inside the frame with a margin at top and bottom at every moment — nothing is ever
cropped. The motion is slow and even, with gentle easing in and out — no bounce, no
overshoot. The shot ends holding still for 1 second on the fully separated assembly.

The camera never moves: no zoom, no pan, no tilt, no shake. Identical warm cream
cyclorama, identical lighting and constant exposure throughout.

Photorealistic, extreme detail, shallow and constant depth of field, single continuous
take, no cuts, no flicker, no text, no people, no brand markings.
```

---

## 5 · MACRO DE LA PUNTA (imagen, con `ref-toe.jpg` como referencia)

```
Extreme macro photograph of the pointed toe of the python pump from the reference image,
seen from directly above and slightly in front, the toe pointing up: the red, black and
cream scales converging toward the tip, the topline edge and a sliver of the red lining
visible at the bottom of the frame. Warm cream cyclorama (#EDE4D6) around it. One soft key
from the upper left, a crisp highlight on every scale. Shot on a 100mm macro at f/8, tack
sharp across the scales, real skin texture, no text, no logo. Square, 2048×2048.
```

---

## 6 · LAS TRES IMÁGENES DEL ATELIER

Formato **4:5 vertical, 1200×1500**. El build las detecta solas: si están, las usa; si no,
recorta macros de la imagen maestra.

Base común:

```
Close-up documentary photograph, shoemaker's atelier in Paris, natural window light from
the left, dust in the air, muted desaturated palette, worn wooden workbench.
Shot on 50mm, f/2, shallow depth of field. Hands and tools only — no faces.
Grainy, filmic, unstyled. No logos, no text. Vertical 4:5 composition.
```

Y el sujeto de cada una:

- **`atelier-montado.png`** — `Two hands stretching a red, black and cream python skin over a hand-carved beech last with steel lasting pincers, the scales catching the window light.`
- **`atelier-cambrillon.png`** — `A slender curved strip of polished tempered steel resting on the bench beside an unfinished leather sole and a small steel hammer, catching a hard specular highlight along its whole length.`
- **`atelier-laca.png`** — `A fine brush applying glossy red lacquer to the underside of a leather sole held in a wooden clamp, the red building up wet and even, a small glass jar of red lacquer beside it.`

---

## La prueba de fuego

**Para el clip a mitad del giro, saca ese fotograma suelto y míralo aislado.** Tiene que
aguantar como fotografía de campaña. Si aguanta, la web es de lujo. Si no, no hay animación
que lo arregle.

Lo que hace fallar esta prueba, y que solo se ve al parar el scroll:

1. ¿La cámara se queda QUIETA? Si hace zoom o se mueve, el scroll "flota".
2. ¿La velocidad es constante? Si acelera o frena, el scrub va a tirones.
3. Giro: ¿acaba en la MISMA posición en la que empieza?
4. **¿Es el MISMO zapato en todos los fotogramas?** Éste es el que suspende de verdad. Con
   pitón es más difícil que con charol: las escamas tienden a "reordenarse" entre fotogramas.
   Al pasarlo a scroll —donde puedes pararte donde quieras— esa respiración se ve entera.
5. ¿Se ve entero y con margen en TODAS las poses, incluida la de perfil?
6. ¿El tacón se despega del crema en todo momento?
7. Paso: ¿el tercio de arriba está vacío en todo el clip? ¿Entra por un lado y sale por el otro?
8. Despiece: **¿se ve el cambrillón de acero?** Si no, el clip no vale.
9. Despiece: ¿el conjunto separado cabe entero, sin cortarse por arriba?

**Si falla el punto 4, la salida es 3D**, no seguir intentándolo con la IA: imagen maestra →
malla (Meshy, Tripo, Rodin) → Blender/Cycles, órbita de 160 fotogramas y despiece desde la
misma escena, con la textura de pitón proyectada desde las fotos. Fondo difuso `#EDE4D6`.
Avísame y añado soporte para secuencia de PNG en el build; hoy solo come vídeo.

Si falla solo en el despiece, la salida intermedia es sustituirlo por 4-5 stills fijos con
transición cruzada. Un despiece inestable hace más daño que no tener despiece.
