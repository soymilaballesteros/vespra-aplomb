/**
 * Dos apariciones, no una.
 *
 * `.reveal`        — fundido corto con desplazamiento. Para bloques, imágenes,
 *                    filas de tabla y formularios.
 * `.reveal-lines`  — la línea sube desde detrás de un canto invisible, una tras
 *                    otra. Solo para titulares y párrafos de display: es cara de
 *                    montar (hay que partir el texto en líneas reales) y pierde
 *                    todo el efecto si se usa en todas partes.
 *
 * El partido guarda el texto original y es idempotente: el estado de la
 * animación vive en la clase del contenedor, no en estilos en línea, así que
 * volver a partir tras un redimensionado no deshace nada.
 *
 * IMPORTANTE: `.reveal-lines` solo admite texto plano. Si el elemento lleva
 * marcado en línea (<em>, <a>…), usa `.reveal`: el partido lo destruiría.
 *
 * Y no se usa NUNCA en el hero. Una animación de entrada sobre lo primero que
 * se pinta es lo que una vez costó 2,3 s de render delay.
 */

const STAGGER_MS = 90
/** Por debajo de este ancho no se parte en líneas. */
const NARROW = 700
const originals = new WeakMap<HTMLElement, string>()

const reduced = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Palabras de un elemento, guardando el texto original la primera vez. */
function wordsOf(el: HTMLElement): string[] {
  let text = originals.get(el)
  if (text === undefined) {
    text = el.textContent ?? ''
    originals.set(el, text)
  }
  return text.trim().split(/\s+/).filter(Boolean)
}

/** Escritura 1: una palabra, un span. */
function writeProbes(el: HTMLElement, words: string[]): HTMLSpanElement[] {
  const probes = words.map((w) => {
    const s = document.createElement('span')
    s.textContent = w
    return s
  })
  el.textContent = ''
  probes.forEach((s, i) => {
    el.append(s)
    if (i < probes.length - 1) el.append(document.createTextNode(' '))
  })
  return probes
}

/** Escritura 2: una línea, dos spans (el de fuera recorta, el de dentro sube). */
function writeLines(el: HTMLElement, words: string[], tops: number[]): void {
  const lines: string[][] = []
  let current: string[] = []
  let lastTop = tops[0]
  words.forEach((w, i) => {
    if (tops[i] !== lastTop) {
      lines.push(current)
      current = []
      lastTop = tops[i]
    }
    current.push(w)
  })
  lines.push(current)

  el.textContent = ''
  lines.forEach((wordsInLine, i) => {
    const outer = document.createElement('span')
    outer.className = 'line'
    const inner = document.createElement('span')
    inner.className = 'line__in'
    // El espacio final no es decorativo: sin él las líneas se concatenan y al
    // copiar el texto (o al leerlo un lector de pantalla) sale "cómodos.Hacemos".
    // Va dentro del span recortado, así que no se ve.
    inner.textContent = wordsInLine.join(' ') + (i < lines.length - 1 ? ' ' : '')
    inner.style.transitionDelay = `${i * STAGGER_MS}ms`
    outer.append(inner)
    el.append(outer)
  })
}

/**
 * Parte todos los `.reveal-lines` de la página en líneas REALES.
 *
 * Va en TRES tandas —escribir todo, leer todo, escribir todo— y no elemento a
 * elemento. Intercalar escrituras y lecturas fuerza un recálculo de layout por
 * elemento, y sobre un documento de 16.000 px con dos secciones fijadas eso son
 * ~100 ms de Total Blocking Time por nada.
 *
 * Se llama desde `main.ts` cuando las fuentes están listas y ANTES del único
 * `ScrollTrigger.refresh()`: partir cambia las cajas de línea, y si el refresh
 * midiera antes, los pins quedarían descuadrados.
 */
export function splitLines(): void {
  if (reduced()) return
  // En pantalla estrecha no se parte, y no es solo por coste: un titular de dos
  // palabras cabe en una línea, así que el efecto no se ve. Lo que sí se nota es
  // lo que cuesta —partir fuerza layout, y con el hilo principal a un cuarto de
  // velocidad son ~600 ms de bloqueo— para no enseñar nada.
  if (window.innerWidth <= NARROW) return
  const items = Array.from(document.querySelectorAll<HTMLElement>('.reveal-lines'))
  if (!items.length) return

  const words = items.map(wordsOf)
  const probes = items.map((el, i) => writeProbes(el, words[i]))
  // Única lectura: aquí, y para todos a la vez.
  const tops = probes.map((ps) => ps.map((s) => s.offsetTop))
  items.forEach((el, i) => { if (words[i].length) writeLines(el, words[i], tops[i]) })
}

export function initReveal(): void {
  const items = Array.from(
    document.querySelectorAll<HTMLElement>('.reveal, .reveal-lines')
  )
  if (!items.length) return

  if (reduced()) {
    items.forEach((el) => el.classList.add('is-in'))
    return
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const el = entry.target as HTMLElement
        // Las líneas ya llevan su propio escalonado; escalonar además por
        // hermanos las descuadraría.
        if (!el.classList.contains('reveal-lines')) {
          const siblings = Array.from(el.parentElement?.children ?? [])
          const idx = siblings.indexOf(el)
          el.style.transitionDelay = `${Math.min(idx, 5) * 70}ms`
        }
        el.classList.add('is-in')
        io.unobserve(el)
      }
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.12 }
  )
  items.forEach((el) => io.observe(el))

  // Al cambiar el ancho, las líneas son otras. Volver a partir es seguro: el
  // estado vive en `.is-in`, que sobrevive al reconstruido.
  let t = 0
  let lastWidth = window.innerWidth
  window.addEventListener('resize', () => {
    if (window.innerWidth === lastWidth) return
    lastWidth = window.innerWidth
    clearTimeout(t)
    t = window.setTimeout(splitLines, 180)
  }, { passive: true })
}
