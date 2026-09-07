import gsap from 'gsap'
import ScrollTrigger from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

/**
 * La colección: un solo zapato y tres pieles.
 *
 * En apaisado la sección está anclada y es el SCROLL quien pasa de una piel a
 * otra: el recorrido se reparte entre las variantes, la activa despliega su
 * ficha y el zapato se viste con esa piel (filtros CSS por `data-look` en la
 * sección). Tocar una variante lleva el scroll a su tramo.
 *
 * En vertical, y con reduce-motion, no hay pin: al señalar (o enfocar, o
 * tocar) una variante cambia la piel, y todas enseñan su ficha.
 */
export function initCollection(): void {
  const section = document.getElementById('coleccion')
  if (!section) return
  const editions = Array.from(section.querySelectorAll<HTMLElement>('.edition[data-look]'))
  const ghosts = Array.from(section.querySelectorAll<HTMLElement>('.collection__ghost [data-look]'))
  const counter = section.querySelector<HTMLElement>('[data-count]')
  if (!editions.length) return

  const set = (look: string | undefined): void => {
    if (!look) return
    if (section.dataset.look !== look) section.dataset.look = look
    editions.forEach((ed) => ed.classList.toggle('is-on', ed.dataset.look === look))
    ghosts.forEach((g) => g.classList.toggle('is-on', g.dataset.look === look))
    const n = editions.findIndex((ed) => ed.dataset.look === look)
    if (counter && n >= 0) counter.textContent = String(n + 1).padStart(2, '0')
  }

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const landscape = window.matchMedia('(min-aspect-ratio: 1/1)')
  const driven = (): boolean => landscape.matches && !reduced

  for (const ed of editions) {
    ed.tabIndex = 0
    ed.addEventListener('pointerenter', () => { if (!driven()) set(ed.dataset.look) })
    ed.addEventListener('focus', () => { if (!driven()) set(ed.dataset.look) })
    ed.addEventListener('click', () => {
      if (!driven()) { set(ed.dataset.look); return }
      // Al tramo de esa variante: el centro de su segmento del recorrido.
      const i = editions.indexOf(ed)
      const top = section.getBoundingClientRect().top + window.scrollY
      const travel = section.offsetHeight - window.innerHeight
      const y = top + travel * ((i + 0.5) / editions.length)
      window.scrollTo({ top: y, behavior: 'smooth' })
    })
  }
  if (reduced) return

  const build = (): void => {
    ScrollTrigger.create({
      trigger: section,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0.4,
      onUpdate: (self) => {
        if (!driven()) return
        const i = Math.min(editions.length - 1, Math.floor(self.progress * editions.length))
        set(editions[i].dataset.look)
      },
    })
  }
  const io = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return
    io.disconnect()
    build()
  }, { rootMargin: '120% 0px 120% 0px' })
  io.observe(section)
}
