/**
 * La espina: una única línea de acero a la izquierda que recorre toda la página
 * sin cortarse. Es el cambrillón — la lámina que sostiene el zapato — y por eso
 * no se rompe en ningún momento. El tramo lleno marca el avance de lectura, las
 * marcas son las secciones y la etiqueta nombra dónde estás.
 *
 * Además decide el color del cromo fijo (barra y espina). `.topbar` y `.spine`
 * viven fuera de las secciones, así que `.on-paper` no las alcanza: si no se
 * invierten a mano, la barra se queda negra sobre marfil y el logotipo se pierde.
 *
 * Las posiciones se cachean y solo se recalculan al redimensionar. Leer
 * offsetTop/scrollHeight en cada frame de scroll fuerza un recálculo de
 * layout por frame (forced reflow) y dispara el Total Blocking Time.
 */
/** Los tres suelos de la página. El cromo fijo tiene que seguirlos. */
type Ground = 'paper' | 'set' | 'dark'

interface SectionSpec {
  id: string
  name: string
  ground: Ground
}

const SECTIONS: SectionSpec[] = [
  { id: 'manifiesto', name: 'Manifiesto', ground: 'paper' },
  { id: 'plano', name: 'El plano', ground: 'paper' },
  { id: 'atelier', name: 'Atelier', ground: 'paper' },
  { id: 'anatomia', name: 'Anatomía', ground: 'set' },
  { id: 'ficha', name: 'Ficha técnica', ground: 'paper' },
  { id: 'casa', name: 'La casa', ground: 'paper' },
  { id: 'coleccion', name: 'La colección', ground: 'paper' },
  { id: 'cita', name: 'Solicitar un par', ground: 'dark' },
]

/** Antes de la primera sección estás en el hero, que es el escenario. */
const HOME_LABEL = 'París'
const HOME_GROUND: Ground = 'set'

/**
 * A qué altura se pregunta "¿qué hay debajo de la barra?". Es el alto de la
 * barra: lo que decide el color del cromo es lo que pasa por detrás de ella,
 * no lo que hay en mitad del viewport.
 */
const CHROME_PROBE = 64

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
  let currentGround: Ground | null = null

  const render = (): void => {
    ticking = false
    const y = window.scrollY
    fill.style.height = `${Math.min(100, Math.max(0, (y / maxScroll) * 100)).toFixed(2)}%`

    // Qué sección pasa por detrás de la barra: decide el color del cromo.
    let ground: Ground = HOME_GROUND
    for (const s of tops) if (s.top <= y + CHROME_PROBE) ground = s.spec.ground
    if (ground !== currentGround) {
      currentGround = ground
      document.documentElement.dataset.chrome = ground
    }

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
