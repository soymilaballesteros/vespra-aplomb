import gsap from 'gsap'
import ScrollTrigger from 'gsap/ScrollTrigger'
import manifest from './frames.manifest.json'

// Registrar aquí también: si no, este módulo depende del orden de los imports
// de main.ts para que el plugin ya esté puesto. Registrar dos veces no cuesta.
gsap.registerPlugin(ScrollTrigger)

/**
 * El plano: el alzado técnico del Aplomb se traza solo conforme bajas.
 *
 * Es la firma de la página y no pesa un solo byte de red — es un SVG en línea.
 * El orden del trazado cuenta la idea: primero el suelo, luego el zapato, luego
 * EL CAMBRILLÓN (la única línea gruesa) y al final las cotas. La pieza que
 * sostiene todo aparece antes que las medidas, no después.
 *
 * La sección NO se fija: es un scrub corto sobre su propia altura, así que no
 * añade un pin más al documento ni entra en el coste del refresh.
 */
/**
 * En una pantalla de 375 px el encuadre de escritorio deja el dibujo en 190 px
 * de alto y las cotas ilegibles. En vertical se recorta por la izquierda —se
 * pierde la punta, que es la parte que menos dice— y se queda el arco, el
 * cambrillón y el tacón, que es de lo que va la sección.
 */
const VIEWBOX = {
  wide: '110 300 700 400',
  narrow: '296 296 512 408',
}

export function initPlan(): void {
  const section = document.getElementById('plano')
  if (!section) return
  const svg = section.querySelector<SVGSVGElement>('.plan__svg')
  if (!svg) return

  // La piel: la foto de perfil detrás del dibujo. El alzado tiene el talón a la
  // DERECHA; si el clip lo tiene a la izquierda, el build lo anota y se voltea.
  const photo = section.querySelector<HTMLElement>('.plan__photo')
  const profile = (manifest as { images?: { profile?: { flip?: boolean } } }).images?.profile
  if (photo && profile?.flip) photo.classList.add('is-flipped')

  // Solo se mueven los TEXTOS entre encuadres, nunca los trazos: si cambiara
  // la geometría de un trazo habría que rearmar su dasharray y la animación se
  // quedaría a medias al rotar el móvil.
  const height = svg.querySelector<SVGTextElement>('.plan__num--h')
  const shankLabel = svg.querySelector<SVGTextElement>('.plan__num--c')

  const narrow = window.matchMedia('(max-width: 700px)')
  const frame = (): void => {
    const n = narrow.matches
    svg.setAttribute('viewBox', n ? VIEWBOX.narrow : VIEWBOX.wide)
    if (height) {
      // En vertical no cabe en horizontal junto a la cota: se pone en vertical
      // sobre la propia línea, como en un plano de verdad.
      height.setAttribute('text-anchor', n ? 'middle' : 'start')
      height.setAttribute('x', n ? '776' : '772')
      height.setAttribute('y', n ? '490' : '497')
      if (n) height.setAttribute('transform', 'rotate(-90 776 490)')
      else height.removeAttribute('transform')
    }
    if (shankLabel) {
      // La llamada pasa de leer hacia la izquierda a leer hacia la derecha: el
      // encuadre estrecho empieza en x=296 y el texto se salía por ese lado.
      shankLabel.setAttribute('text-anchor', n ? 'start' : 'end')
      shankLabel.setAttribute('x', n ? '362' : '344')
      shankLabel.setAttribute('y', n ? '672' : '652')
    }
  }
  frame()
  narrow.addEventListener('change', frame)

  const pick = (sel: string): SVGPathElement[] =>
    Array.from(svg.querySelectorAll<SVGPathElement>(sel))

  const ground = pick('.plan__rule')
  const outline = pick('.plan__line')
  const hint = pick('.plan__hint')
  const shank = pick('.plan__shank')
  const dims = pick('.plan__dim, .plan__ext')
  const nums = Array.from(svg.querySelectorAll<SVGTextElement>('.plan__num'))

  // `hint` fuera: lleva su propio discontinuo en CSS y trazarlo con
  // stroke-dashoffset lo pisaría. Ese se funde.
  const strokes = [...ground, ...outline, ...shank, ...dims]
  if (!strokes.length) return

  // El estado por defecto del SVG es DIBUJADO. Esconderlo es lo que hace el JS,
  // así que con reduce-motion —o si este módulo fallara— el plano se ve entero.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    // Sin movimiento: la piel se queda como una sombra bajo el plano.
    if (photo) photo.style.opacity = '0.14'
    return
  }

  // Cada trazo se esconde con su propia longitud. `getTotalLength()` es
  // geometría pura: no depende del layout y se puede pedir antes de pintar.
  for (const p of strokes) {
    const len = p.getTotalLength()
    p.style.strokeDasharray = `${len}`
    p.style.strokeDashoffset = `${len}`
  }
  for (const t of [...nums, ...hint]) t.style.opacity = '0'

  /**
   * El trigger se crea cuando la sección se acerca, no al arrancar.
   *
   * El `ScrollTrigger.refresh()` único de main.ts vuelve a medir TODOS los
   * triggers sobre un documento de 16.000 px con dos secciones fijadas. Sumar
   * este a esa medición encarecía el bloqueo inicial sin ninguna necesidad: el
   * plano está a media página y nadie lo ve hasta que baja. Creado después,
   * ScrollTrigger lo mide él solo y no entra en el refresh caro.
   */
  const build = (): void => {
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: svg,
        start: 'top 82%',
        end: 'bottom 72%',
        scrub: 0.6,
      },
    })

    const draw = (targets: Element[], duration: number, stagger = 0.08) =>
      tl.to(targets, { strokeDashoffset: 0, duration, stagger, ease: 'none' })

    draw(ground, 0.35)
    tl.to(hint, { opacity: 1, duration: 0.6 }, '-=0.15')
    // «Quítale la piel y queda esto»: la foto se disuelve mientras aparece la
    // estructura, y se queda como una sombra muy leve.
    if (photo) tl.to(photo, { opacity: 0.1, duration: 1.6, ease: 'none' }, 0.2)
    draw(outline, 1.1, 0.18)
    // El cambrillón entra solo y va más despacio: es el que hay que mirar.
    draw(shank, 1.2)
    draw(dims, 0.9, 0.06)
    tl.to(nums, { opacity: 1, duration: 0.35, stagger: 0.08 }, '-=0.5')
  }

  const io = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return
    io.disconnect()
    build()
  }, { rootMargin: '120% 0px 120% 0px' })
  io.observe(section)
}
