import gsap from 'gsap'
import ScrollTrigger from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

/**
 * La casa: los años sobre un camino.
 *
 * El giro del zapato es el fondo (una secuencia sin pin, con el scrub de arriba
 * a abajo de la sección) y encima va una curva roja que se traza con el scroll,
 * con cinco puntos; cada año se coloca sobre su punto y se enciende cuando el
 * trazo llega. La curva se calcula en píxeles del escenario en cada resize, así
 * que los años caen siempre exactamente sobre ella.
 *
 * En vertical, y con reduce-motion, no hay camino: la lista de años en flujo
 * (lo decide el CSS) y aquí no se hace nada.
 */
/** Dónde cae cada año a lo largo del camino, en fracciones de su longitud. */
const STOPS = [0.05, 0.28, 0.5, 0.72, 0.95]

export function initHeritage(): void {
  const section = document.getElementById('casa')
  if (!section) return
  const ui = section.querySelector<HTMLElement>('.heritage__ui')
  const svg = section.querySelector<SVGSVGElement>('.heritage__path')
  const line = section.querySelector<SVGPathElement>('.heritage__line')
  const trace = section.querySelector<SVGPathElement>('.heritage__trace')
  const dots = section.querySelector<SVGGElement>('.heritage__dots')
  const items = Array.from(section.querySelectorAll<HTMLElement>('.timeline li'))
  if (!ui || !svg || !line || !trace || !dots || items.length < 2) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  const landscape = window.matchMedia('(min-aspect-ratio: 1/1)')
  const stops = items.map((_, i) => STOPS[i] ?? (i + 0.5) / items.length)
  let length = 0
  let progress = 0

  const layout = (): void => {
    if (!landscape.matches) {
      section.classList.remove('is-path')
      items.forEach((li) => { li.style.left = ''; li.style.top = '' })
      return
    }
    const w = ui.clientWidth
    const h = ui.clientHeight
    if (!w || !h) return
    section.classList.add('is-path')
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
    // Una S suave que baja de izquierda a derecha, dejando libre la esquina
    // del título (arriba a la izquierda) y la del zapato (abajo a la derecha).
    const d = `M ${0.05 * w} ${0.34 * h} C ${0.24 * w} ${0.2 * h}, ${0.3 * w} ${0.66 * h}, ${0.5 * w} ${0.56 * h} S ${0.78 * w} ${0.34 * h}, ${0.95 * w} ${0.5 * h}`
    line.setAttribute('d', d)
    trace.setAttribute('d', d)
    length = trace.getTotalLength()
    trace.style.strokeDasharray = `${length}`
    dots.replaceChildren()
    items.forEach((li, i) => {
      const pt = trace.getPointAtLength(stops[i] * length)
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
      c.setAttribute('cx', pt.x.toFixed(1))
      c.setAttribute('cy', pt.y.toFixed(1))
      c.setAttribute('r', '5')
      dots.append(c)
      li.style.left = `${pt.x.toFixed(1)}px`
      li.style.top = `${pt.y.toFixed(1)}px`
      // Los del final cuelgan hacia la izquierda para no salirse del escenario;
      // los pares van por encima de la línea y los impares por debajo.
      li.classList.toggle('is-right', pt.x > 0.62 * w)
      li.classList.toggle('is-above', i % 2 === 1)
    })
  }

  let active = -2
  const render = (): void => {
    if (!landscape.matches || !length) return
    trace.style.strokeDashoffset = `${length * (1 - progress)}`
    let n = -1
    stops.forEach((s, i) => { if (progress >= s - 0.02) n = i })
    if (n === active) return
    active = n
    items.forEach((li, i) => li.classList.toggle('is-on', i <= n))
    Array.from(dots.children).forEach((c, i) => c.classList.toggle('is-on', i <= n))
  }

  const build = (): void => {
    layout()
    render()
    new ResizeObserver(() => { layout(); active = -2; render() }).observe(ui)
    ScrollTrigger.create({
      trigger: section,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0.6,
      onUpdate: (self) => { progress = self.progress; render() },
    })
  }
  const io = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return
    io.disconnect()
    build()
  }, { rootMargin: '120% 0px 120% 0px' })
  io.observe(section)
}
