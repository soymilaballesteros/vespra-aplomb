import gsap from 'gsap'
import ScrollTrigger from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

/**
 * La punta: una macro fija que se acerca conforme bajas.
 *
 * No es una secuencia de fotogramas: es UNA imagen y un scrub sobre su escala y
 * su posición. El anclaje lo hace `position: sticky` en CSS, no el pin de
 * ScrollTrigger, y no es un detalle: un pin añade altura al documento cuando se
 * crea, y todo lo que hay debajo (las marcas de la espina, los pins de más
 * abajo) se desplaza. Con sticky la altura de la sección es la del CSS desde el
 * primer layout y el único ScrollTrigger de aquí es un scrub sin pin, que
 * apenas cuesta en el refresh.
 *
 * Con reduce-motion la sección no se ancla ni se mueve: imagen y texto, en su
 * altura natural (lo decide el CSS).
 */
const SCALE_TO = 1.32
const SHIFT_Y = -6 // % de la altura de la imagen: sube un poco al acercarse

export function initDetail(): void {
  const section = document.getElementById('detalle')
  if (!section) return
  const img = section.querySelector<HTMLElement>('.detail__img')
  if (!img) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  const build = (): void => {
    gsap.fromTo(
      img,
      { scale: 1, yPercent: 0 },
      {
        scale: SCALE_TO,
        yPercent: SHIFT_Y,
        ease: 'none',
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: 'bottom bottom',
          scrub: 0.6,
        },
      }
    )
  }

  // Como el plano: el trigger se crea cuando la sección se acerca, no al
  // arrancar, para no entrar en el coste del refresh inicial.
  const io = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return
    io.disconnect()
    build()
  }, { rootMargin: '120% 0px 120% 0px' })
  io.observe(section)
}
