/**
 * La espina: una única línea a la izquierda que recorre toda la página sin
 * cortarse. Es el filo de la suela —el rojo lacado que asoma a cada paso— y por
 * eso es lo único de la página, aparte del zapato, que lleva ese color. El tramo
 * lleno marca el avance de lectura, las marcas son las secciones y la etiqueta
 * nombra dónde estás.
 *
 * Las posiciones se cachean y solo se recalculan al redimensionar. Leer
 * offsetTop/scrollHeight en cada frame de scroll fuerza un recálculo de
 * layout por frame (forced reflow) y dispara el Total Blocking Time.
 */
interface SectionSpec {
  id: string
  name: string
}

const SECTIONS: SectionSpec[] = [
  { id: 'manifiesto', name: 'Manifiesto' },
  { id: 'paso', name: 'El paso' },
  { id: 'plano', name: 'El plano' },
  { id: 'atelier', name: 'Atelier' },
  { id: 'anatomia', name: 'Anatomía' },
  { id: 'detalle', name: 'La punta' },
  { id: 'ficha', name: 'Ficha técnica' },
  { id: 'casa', name: 'La casa' },
  { id: 'coleccion', name: 'La colección' },
  { id: 'cita', name: 'Solicitar un par' },
]

/** Antes de la primera sección estás en el hero. */
const HOME_LABEL = 'París'

export function initSpine(): void {
  const spine = document.querySelector<HTMLElement>('.spine')
  const fill = document.querySelector<HTMLElement>('#spineFill')
  const label = document.querySelector<HTMLElement>('#spineLabel')
  if (!fill) return

  const elements = SECTIONS
    .map((spec) => {
      const el = document.getElementById(spec.id)
      return el ? { el, spec } : null
    })
    .filter((s): s is { el: HTMLElement; spec: SectionSpec } => s !== null)

  let tops: Array<{ top: number; spec: SectionSpec }> = []
  let maxScroll = 1
  let ticks: HTMLElement[] = []

  if (spine) {
    ticks = elements.map(() => {
      const tick = document.createElement('i')
      tick.className = 'spine__tick'
      spine.append(tick)
      return tick
    })
  }

  /** Única función que toca el layout. Se llama al cargar y al redimensionar. */
  const measure = (): void => {
    maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
    tops = elements.map((s) => ({
      top: s.el.getBoundingClientRect().top + window.scrollY,
      spec: s.spec,
    }))
    // Las marcas cuelgan del mismo cálculo que el relleno, así que caen justo
    // donde el tramo lleno cruza cada sección.
    tops.forEach((s, i) => {
      const tick = ticks[i]
      if (tick) tick.style.top = `${Math.min(100, Math.max(0, (s.top / maxScroll) * 100)).toFixed(2)}%`
    })
  }

  let ticking = false
  let currentName = ''

  const render = (): void => {
    ticking = false
    const y = window.scrollY
    fill.style.height = `${Math.min(100, Math.max(0, (y / maxScroll) * 100)).toFixed(2)}%`

    if (!label) return
    // La etiqueta mira al centro del viewport, no a la barra: nombra lo que
    // estás leyendo, no lo que acaba de entrar.
    const mid = y + window.innerHeight * 0.4
    let name = HOME_LABEL
    for (const s of tops) if (s.top <= mid) name = s.spec.name
    if (name !== currentName) {
      currentName = name
      label.textContent = name
    }
  }

  const onScroll = (): void => {
    if (ticking) return
    ticking = true
    requestAnimationFrame(render)
  }

  const onResize = (): void => {
    measure()
    onScroll()
  }

  measure()
  render()
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onResize, { passive: true })
  // El pin de ScrollTrigger cambia la altura del documento al inicializarse.
  window.addEventListener('load', onResize, { once: true })
}
