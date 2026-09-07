// `standard` en vez de `wght`: trae también el eje óptico (opsz), que es lo que
// da el corte de display de la Didone. Cuesta 20 KB más en la latina y es la
// diferencia entre un titular de casa de costura y un Times estirado.
import '@fontsource-variable/bodoni-moda/standard.css'
import '@fontsource-variable/instrument-sans/wght.css'
import './styles/tokens.css'
import './styles/base.css'
import './styles/chrome.css'
import './styles/sections.css'
import './styles/sequence.css'

import ScrollTrigger from 'gsap/ScrollTrigger'
import { ScrollSequence } from './scroll-sequence'
import { initReveal, splitLines } from './reveal'
import { initForm } from './form'
import { initSpine } from './spine'
import { initNav } from './nav'
import { initPlan } from './plan'
import { initDetail } from './detail'
import { initAtelier } from './atelier'
import { initHeritage } from './heritage'
import { initCollection } from './collection'
import { bindBeats } from './beats'
import { Camera, initCameras } from './camera'

const sequences: ScrollSequence[] = []
let cameras: Camera[] = []
const landscape = window.matchMedia('(min-aspect-ratio: 1/1)')

function initSequences(): void {
  const sections = document.querySelectorAll<HTMLElement>('.seq[data-seq]')
  for (const section of sections) {
    const name = section.dataset.seq!
    const lengthVh = Number(section.dataset.length) || 300
    const beats = bindBeats(section)
    const isHero = section.classList.contains('hero')
    const range = section.dataset.range?.split(',').map(Number)
    const seq = new ScrollSequence({
      section,
      name,
      lengthVh,
      eager: isHero,
      focusLandscape: Number(section.dataset.focus) || undefined,
      focusX: Number(section.dataset.focusX) || undefined,
      fill: section.dataset.fill === 'cover' ? 'cover' : 'subject',
      fillPortrait: section.dataset.fillPortrait === 'cover' ? 'cover'
        : section.dataset.fillPortrait === 'subject' ? 'subject' : undefined,
      pinned: section.dataset.pin !== 'none',
      fillX: Number(section.dataset.fillX) || undefined,
      fillY: Number(section.dataset.fillY) || undefined,
      start: section.dataset.start,
      end: section.dataset.end,
      transparent: section.dataset.transparent !== undefined,
      range: range && range.length === 2 && range.every((n) => !Number.isNaN(n))
        ? [range[0], range[1]]
        : undefined,
      onProgress: (p) => {
        beats(p)
        // En apaisado el titular se retira entre el 4% y el 22% del giro y la
        // primera nota entra justo al 22%: no hay tramo con el zapato solo. En
        // vertical NO: ahí el texto va debajo del producto, no lo tapa, y sin
        // él media pantalla se queda vacía.
        if (isHero) {
          const fade = landscape.matches
            ? 1 - Math.min(1, Math.max(0, (p - 0.04) / 0.18))
            : 1
          section.style.setProperty('--hero-copy', fade.toFixed(3))
          // Las dos líneas del titular se abren hacia los lados mientras se van.
          const split = landscape.matches ? Math.min(1, Math.max(0, (p - 0.02) / 0.2)) : 0
          section.style.setProperty('--hero-split', (split * split).toFixed(4))
          // Las palabras gigantes derivan unos píxeles con el giro (--hero-p).
          section.style.setProperty('--hero-p', p.toFixed(4))
        }
      },
    })
    seq.init()
    sequences.push(seq)
  }
}

/**
 * El ratón mueve unos píxeles el titular del hero (--mx/--my en -1..1). Solo
 * con puntero fino y sin reduce-motion; es un gesto, no una animación.
 */
function initHeroParallax(): void {
  const hero = document.getElementById('hero')
  if (!hero) return
  if (!window.matchMedia('(pointer: fine)').matches) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  let raf = 0
  let mx = 0
  let my = 0
  hero.addEventListener('pointermove', (e) => {
    mx = (e.clientX / window.innerWidth) * 2 - 1
    my = (e.clientY / window.innerHeight) * 2 - 1
    if (raf) return
    raf = requestAnimationFrame(() => {
      raf = 0
      hero.style.setProperty('--mx', mx.toFixed(3))
      hero.style.setProperty('--my', my.toFixed(3))
    })
  }, { passive: true })
}

function initHud(): void {
  if (!new URLSearchParams(location.search).has('debug')) return
  const hud = document.createElement('div')
  hud.className = 'hud'
  hud.id = 'hud'
  document.body.append(hud)
  // Intervalo, no requestAnimationFrame: un bucle rAF permanente mantiene la
  // página siempre "animando" y quema CPU solo para depurar.
  let last = ''
  const tick = (): void => {
    const text = sequences.map((s) => s.debugLine()).join('\n')
    if (text !== last) { last = text; hud.textContent = text }
  }
  tick()
  setInterval(tick, 100)
}

initNav()
initSpine()
initReveal()
initPlan()
initDetail()
initAtelier()
initHeritage()
initCollection()
initForm()
initSequences()
// La cámara sobre fotos (anatomía, ficha): mismos hitos, otra fuente.
cameras = initCameras(bindBeats)
initHeroParallax()
initHud()

/**
 * El pin debe calcularse con el layout FINAL: si las fuentes o el póster del
 * hero cambian la altura después, queda descuadrado y la animación "no avanza".
 *
 * Pero cada refresh vuelve a medir los dos pins sobre un documento de ~14.000 px
 * y cuesta cerca de un segundo de cálculo de estilos en un móvil modesto. Con
 * dos llamadas sueltas (fuentes + load) el Total Blocking Time se disparaba a
 * más de 1 s. Aquí se espera a que ocurran ambas cosas y se refresca UNA vez.
 */
function refreshOnce(): void {
  let pending = 2
  const done = (): void => {
    if (--pending > 0) return
    requestAnimationFrame(() => {
      ScrollTrigger.refresh()
      // Partir los titulares en líneas va DESPUÉS de medir, y en su propio
      // hueco. Partir antes obliga al refresh a medir un DOM con tres veces más
      // nodos de texto, y las dos operaciones juntas costaban 1,6 s de bloqueo
      // frente a los 200 ms que cuestan por separado. Se puede separar porque el
      // partido ya no cambia el alto de ningún bloque (ver base.css).
      const idle = (window as Window & {
        requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void
      }).requestIdleCallback
      if (idle) idle(splitLines, { timeout: 1500 })
      else setTimeout(splitLines, 300)
    })
  }
  if (document.fonts) document.fonts.ready.then(done, done)
  else done()
  if (document.readyState === 'complete') done()
  else window.addEventListener('load', done, { once: true })
}

// La barra de direcciones del móvil cambia de alto al hacer scroll; sin esto,
// ScrollTrigger se refresca en mitad del scroll y provoca tirones.
ScrollTrigger.config({ ignoreMobileResize: true })
refreshOnce()

// Puente para la verificación automatizada en navegador.
declare global {
  interface Window {
    __seq?: () => Record<string, unknown>[]
    __cam?: () => Record<string, unknown>[]
  }
}
window.__seq = () => sequences.map((s) => s.debugState())
window.__cam = () => cameras.map((c) => c.debugState())
