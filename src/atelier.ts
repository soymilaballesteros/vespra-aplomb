import gsap from 'gsap'
import ScrollTrigger from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

/**
 * El atelier: tres paneles a pantalla completa que se desplazan en horizontal
 * al ritmo del scroll.
 *
 * La sección es alta (el recorrido) y dentro hay un pin `sticky` de 100svh con
 * un carril de tres paneles de 100% de ancho. El scrub mueve el carril de 0 a
 * -(n-1) paneles con `transform`, y cada foto se desplaza un poco en sentido
 * contrario según dónde esté su panel en pantalla: es el paralaje que hace que
 * la foto "pase" detrás del texto en vez de ir pegada a él.
 *
 * Como en el plano y la punta, el anclaje es `sticky`, no un pin de
 * ScrollTrigger, y el trigger se crea cuando la sección se acerca. En vertical
 * y con reduce-motion el CSS apila los paneles y aquí no se hace nada.
 */
const PARALLAX = 0.06 // fracción del ancho del panel que recorre la foto

export function initAtelier(): void {
  const section = document.getElementById('atelier')
  if (!section) return
  const track = section.querySelector<HTMLElement>('.atelier__track')
  const pin = section.querySelector<HTMLElement>('.atelier__pin')
  if (!track || !pin) return
  const panels = Array.from(track.querySelectorAll<HTMLElement>('.craft'))
  const photos = panels.map((p) => p.querySelector<HTMLElement>('.craft__img'))
  const counter = section.querySelector<HTMLElement>('[data-count]')
  if (panels.length < 2) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  const landscape = window.matchMedia('(min-aspect-ratio: 1/1)')
  let width = 0
  const measure = (): void => { width = pin.clientWidth }

  let current = -1
  const render = (p: number): void => {
    // En vertical el CSS apila los paneles y anula el transform; no se toca nada.
    if (!landscape.matches || !width) return
    const travel = (panels.length - 1) * width
    const x = -p * travel
    track.style.transform = `translate3d(${x.toFixed(1)}px, 0, 0)`
    panels.forEach((_, i) => {
      // Posición del panel en pantalla, de -1 (fuera por la izquierda) a 1.
      const rel = Math.max(-1, Math.min(1, (i * width + x) / width))
      const photo = photos[i]
      if (photo) photo.style.transform = `translate3d(${(rel * PARALLAX * width).toFixed(1)}px, 0, 0) scale(1.12)`
    })
    const idx = Math.min(panels.length - 1, Math.round(p * (panels.length - 1)))
    if (idx !== current) {
      current = idx
      if (counter) counter.textContent = String(idx + 1).padStart(2, '0')
    }
  }

  const build = (): void => {
    measure()
    render(0)
    new ResizeObserver(() => { measure(); render(progress) }).observe(pin)
    ScrollTrigger.create({
      trigger: section,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0.6,
      onUpdate: (self) => { progress = self.progress; render(progress) },
    })
  }
  let progress = 0

  const io = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return
    io.disconnect()
    build()
  }, { rootMargin: '120% 0px 120% 0px' })
  io.observe(section)
}
