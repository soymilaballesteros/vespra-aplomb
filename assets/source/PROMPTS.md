# VESPRA — APLOMB · Prompts de generación

Maison ficticia. París, 1949. Modelo **APLOMB**: salón de charol negro, 105 mm.
Gancho: *todo tu peso pasa por nueve milímetros* — el cambrillón, la lámina de acero
templado escondida en la suela que es lo único que sostiene un tacón de aguja.
Firma de la casa: **el canto de la suela pintado en marfil**, una línea de dos milímetros
que recorre todo el perímetro y se ve en cualquier vista de tres cuartos.

Orden: **1) imagen maestra → 2) clip rotación → 3) clip despiece → 4) atelier**.
Los dos vídeos usan la MISMA imagen como fotograma inicial (image-to-video).
Eso garantiza que sea literalmente el mismo zapato en las dos animaciones.

---

## Ajustes técnicos

| Asset | Formato | Archivo |
|---|---|---|
| Imagen maestra | **16:9**, máxima resolución (mín. 1920×1080) | `assets/source/product-ref.png` |
| Clip rotación 360° | **16:9**, 1920×1080, **10 s a 24 fps o más** | `assets/source/product-rotate.mp4` |
| Clip despiece | **16:9**, 1920×1080, mismos ajustes | `assets/source/product-explode.mp4` |
| 3 macros del atelier | 4:5 vertical, 1200×1500 | `assets/source/atelier-{montado,cambrillon,canto}.png` |

**16:9 y no vertical.** Un salón de perfil es ~1,9 veces más largo que alto; de frente es
estrecho y alto. Durante el giro completo, la caja que ocupa el zapato es la unión de todas
las poses: ~1,9:1, casi exactamente 16:9. En 16:9 a 1080p el zapato conserva ~1.630 px de
ancho; en 1:1 solo ~810.

**Mínimo 200 fotogramas de origen.** El build extrae 160 del giro. Un clip de 5 s a 24 fps
solo tiene 120: al pedir 160 se repetirían fotogramas y el giro daría tirones. 10 s a 24 fps
(240) o 8 s a 30 fps (240) van sobrados.

---

## ⚠︎ Las dos reglas que deciden si el material sirve

### 1 · El zapato tiene que llenar el 85 % del ancho

En su pose más ancha —la de perfil— el zapato ocupa el **85 % del ancho del encuadre**.

No es una manía de composición: cada píxel que gastas en fondo vacío es un píxel que el
lienzo tiene que ampliar después. En el clip anterior el zapato llenaba el 64 % y el build
tenía que recortar para llegar al 88 %, perdiendo resolución por el camino. Si viene ya
encuadrado, no se pierde nada. `pnpm frames` te avisa si baja del 70 %.

### 2 · El zapato tiene que separarse del fondo por valor

El build localiza la pieza midiendo su **contraste contra el fondo**, y de ahí salen el
recorte, el encuadre del lienzo y el póster. Charol negro sobre gris perla se separa de
sobra — pero el lado en sombra del zapato puede fundirse con el gris si falta la luz de
contorno. Por eso el prompt la pide explícitamente.

Comprobación antes de dar la imagen por buena: ponla en blanco y negro y sube mucho el
contraste. El **contorno completo** del zapato, tacón incluido, tiene que seguir leyéndose.
Si `pnpm frames` no distingue el producto, te lo dice y no genera nada.

---

## 1 · IMAGEN MAESTRA

```
Editorial product photograph of a single black patent leather pointed-toe pump,
105mm sculpted stiletto heel, seamless one-piece upper with no visible seams,
ivory-painted sole edge — a clean 2mm ivory line running the whole perimeter.
Three-quarter view, heel toward camera, toe angled away.

Studio: infinite cyclorama, cool pearl grey background (#B7B4AF), smooth vertical
falloff, no visible horizon line. Lighting: one large soft key at 45 degrees upper
left, faint bounce from the right, and a narrow rim light behind tracing the topline
of the vamp and the full length of the heel, so the whole silhouette separates from
the grey. Short crisp specular highlight along the instep — patent, not glossy plastic.

Shot on 120mm equivalent, camera at shoe height, shallow compression, no wide-angle
distortion. Soft contact shadow fading within 4cm, no mirror floor.

The shoe fills 85% of the frame width. Muted, desaturated, quiet. No props, no flowers,
no marble, no fabric, no smoke, no second shoe, no text, no logo, NO RED SOLE, no
quilted diamond pattern. Photographic, not CGI. 16:9, extremely sharp, fine grain of
the patent visible.
```

---

## 2 · CLIP A — ROTACIÓN 360° (image-to-video con la imagen de arriba)

```
The exact black patent pump from the reference image, rotating slowly on its vertical
axis as if on an invisible turntable: exactly one full 360-degree revolution that begins
and ends in precisely the same position as the first frame.

The camera is completely static — locked off on a tripod. No zoom, no push-in, no
handheld shake, no parallax, no camera movement of any kind.

The rotation speed is perfectly constant and linear from the first frame to the last:
no ease-in, no ease-out, no acceleration, no pause.

The shoe stays exactly the same size in frame throughout and never leaves the frame. In
its widest pose — full profile — it fills 85% of the frame width with a clear margin at
both sides. The ivory sole edge stays visible as a continuous clean line. The slender
stiletto heel stays lit and separated from the grey background for the entire revolution.

Identical pearl grey cyclorama and identical lighting throughout, with constant exposure.
The specular highlight glides smoothly along the instep as the shoe turns.

Photorealistic, extreme detail, single continuous take, no cuts, no flicker, no morphing,
no text, no people.
```

---

## 3 · CLIP B — DESPIECE (image-to-video con la MISMA imagen)

```
Ultra-detailed macro product video of the exact black patent pump from the reference
image, in one single continuous take with a completely static locked-off camera.

The shoe begins fully assembled in lateral profile, sized to occupy about 55% of the
frame width, and holds still for 1 second. Then it opens into a precise technical
exploded view along one shared vertical axis, each component floating apart in clean,
evenly spaced layers, in this order and staggered — each piece starts moving slightly
after the previous one, never all at once:

  1. the black patent upper rises and opens up and to the left,
  2. the kidskin lining slides out behind it,
  3. the leather insole lowers,
  4. a slender curved POLISHED STEEL SHANK slides toward the viewer and hangs suspended
     in the centre — a thin mirror-bright metal strip, unmistakably metal against all the
     black patent and pale leather,
  5. the covered stiletto heel lowers and rotates about 15 degrees,
  6. the leather outsole with its ivory-painted edge settles at the bottom.

THE STEEL SHANK IS THE HERO COMPONENT: clearly visible, clearly separate, clearly metal.

Maximum separation is 1.4 times the length of the shoe. The whole exploded assembly stays
inside the frame with a margin at top and bottom at every moment — nothing is ever
cropped. The motion is slow and even, with gentle easing in and out — no bounce, no
overshoot. The shot ends holding still for 1 second on the fully separated assembly.

The camera never moves: no zoom, no pan, no tilt, no shake. Identical pearl grey
cyclorama, identical lighting and constant exposure throughout.

Photorealistic, extreme detail, shallow and constant depth of field, single continuous
take, no cuts, no flicker, no text, no people.
```

---

## La prueba de fuego

Ésta es la que decide si el material vale, y va por delante de la lista de siempre.

**Para el clip a mitad del giro, saca ese fotograma suelto y míralo aislado.** Tiene que
aguantar como fotografía de campaña. Si aguanta, la web es de lujo. Si no, no hay animación
que lo arregle.

Lo que hace fallar esta prueba, y que solo se ve al parar el scroll:

1. ¿La cámara se queda QUIETA? Si hace zoom o se mueve, el scroll "flota".
2. ¿La velocidad es constante? Si acelera o frena, el scrub va a tirones.
3. Rotación: ¿acaba en la MISMA posición en la que empieza?
4. **¿Es el MISMO zapato en todos los fotogramas?** Éste es el que suspende de verdad. La
   punta cambia de curva, el tacón cambia de altura, el canto marfil aparece y desaparece.
   Al pasarlo a scroll —donde tú controlas la velocidad y puedes pararte donde quieras— esa
   respiración se ve entera, y es exactamente lo que hace que una web se lea como "hecha con
   IA" en vez de "hecha por una casa".
5. ¿Se ve entero y con margen en TODAS las poses, incluida la de perfil?
6. ¿El contorno se despega del gris en todo momento, o hay poses donde se pierde?
7. Despiece: **¿se ve el cambrillón de acero?** Si no, el clip no vale: es la pieza que
   justifica toda la página.
8. Despiece: ¿el conjunto separado cabe entero, sin cortarse por arriba?

**Si falla el punto 4, la salida es 3D**, no seguir intentándolo con la IA: imagen maestra →
malla (Meshy, Tripo, Rodin) → Blender/Cycles, órbita de 160 fotogramas y despiece desde la
misma escena. Materiales de charol: base #0A0A0B, rugosidad 0.08, clearcoat 1.0 con rugosidad
0.03. Fondo difuso #B7B4AF. Avísame y añado soporte para secuencia de PNG en el build; hoy
solo come vídeo.

Si falla solo en el despiece, la salida intermedia es sustituirlo por 4-5 stills fijos con
transición cruzada. Un despiece inestable hace más daño que no tener despiece.

---

## 4 · LAS TRES IMÁGENES DEL ATELIER

Formato **4:5 vertical, 1200×1500**. El build las detecta solas: si están, las usa; si no,
recorta macros de la imagen maestra, que es el punto flojo que tenía la web anterior.

Base común para las tres:

```
Close-up documentary photograph, shoemaker's atelier in Paris, natural window light from
the left, dust in the air, muted desaturated palette, worn wooden workbench.
Shot on 50mm, f/2, shallow depth of field. Hands and tools only — no faces.
Grainy, filmic, unstyled. No logos, no text. Vertical 4:5 composition.
```

Y el sujeto de cada una:

- **`atelier-montado.png`** — `Two hands stretching black patent leather over a hand-carved beech last with steel lasting pincers.`
- **`atelier-cambrillon.png`** — `A slender curved strip of polished tempered steel resting on the bench beside an unfinished leather sole and a small steel hammer, catching a hard specular highlight along its whole length.`
- **`atelier-canto.png`** — `A cotton pad applying ivory pigment to the edge of a leather sole, held in a wooden clamp, the ivory line building up against the black patent above.`

---

## Variantes de material

Cambia solo la línea del material en la imagen maestra y repite los clips.

- **Charol negro** (el del prompt) — reflejo especular corto y definido, es la superficie
  que mejor lee el gesto de la horma.
- **Napa mate en nude** `#E3D5C3` — más suave, menos dramático, igual de couture.

**No uses piel de pitón.** Lee como 2013; el charol liso y el nude leen como 2026. Si quieres
textura, que sea grano de becerro, no escama. Y en cualquier caso: **nada de suela roja**
(marca registrada de Louboutin) ni acolchado de rombos (*cannage*, firma de Dior).
