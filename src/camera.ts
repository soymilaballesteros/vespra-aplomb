import gsap from 'gsap'
import ScrollTrigger from 'gsap/ScrollTrigger'
import manifest from './frames.manifest.json'

gsap.registerPlugin(ScrollTrigger)

/**
 * La cámara sobre fotos: un marco fijo, varias fotografías apiladas, y un
 * scroll que mueve el objetivo por ellas.
 *
 * No hay clip de despiece. En vez de una secuencia de fotogramas, la Anatomía
 * (y la Ficha técnica) recorren FOTOS: cada tramo del scroll es un plano —una
 * foto, un punto de interés y un zoom que se acerca despacio—, y entre plano y
 * plano la foto siguiente entra en fundido sobre la anterior. Es lo que hace un
 * documental de producto con un rodaje de stills: la cámara se mueve, no la pieza.
 *
 * Solo se anima `transform` y `opacity`, que van al compositor: ningún layout
 * en el scroll. El anclaje es `position: sticky` en CSS, no un pin de
 * ScrollTrigger, por la misma razón que en La punta (src/detail.ts): un pin
 * añade altura al documento al crearse y desplaza lo que hay debajo.
 *
 * Marcado:
 *
 *   <figure class="cam" data-cam data-cam-scroll="pin|flow" data-fit="cover|contain">
 *     <img class="cam__layer" data-from="x,y,z" data-to="x,y,z" data-weight="2" …>
 *     <img class="cam__layer" data-shots="x,y,z>x,y,z; x,y,z>x,y,z; …" …>
 *     …
 *     <i class="cam__mark"></i>          (opcional: la marca sobre el punto)
 *   </figure>
 *
 * `x,y` es el punto de interés en fracciones de la IMAGEN (0-1) y `z` el zoom
 * sobre el encaje inicial. `data-weight` es cuánto scroll se lleva ese plano
 * respecto a los demás (por defecto 1). Una misma foto puede llevar VARIOS
 * planos seguidos (`data-shots`, la ficha): entre dos planos de la misma foto
 * la cámara no corta, se desliza del final de uno al principio del otro. `pin`:
 * el recorrido es la sección entera, de arriba a abajo (sección anclada);
 * `flow`: desde que asoma por abajo hasta que se va por arriba, como los duetos.
 *
 * Con reduce-motion, o sin JS, se ve la primera foto quieta (lo hace el CSS).
 */
interface Focus { x: number; y: number; z: number }

interface Shot {
  layer: HTMLImageElement
  from: Focus
  to: Focus
  /** Tramo del recorrido, en fracciones 0-1. */
  p0: number
  p1: number
  /** Encaje base: tamaño de la foto sin zoom y su posición centrada en el marco. */
  lw: number
  lh: number
  ox: number
  oy: number
}

/** Qué parte del plano anterior ocupa el fundido de entrada del siguiente. */
const FADE = 0.22
/** El punto de interés cae aquí dentro del marco (centro). */
const ANCHOR = { x: 0.5, y: 0.5 }

function parseFocus(s: string | undefined, fallback: Focus): Focus {
  if (!s) return fallback
  const n = s.split(',').map(Number)
  if (n.length !== 3 || n.some((v) => Number.isNaN(v))) return fallback
  return { x: n[0], y: n[1], z: n[2] }
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))
/** Rampa suave 0→1 entre a y b. */
const ramp = (v: number, a: number, b: number): number => clamp01((v - a) / (b - a))

/**
 * Posición del canto izquierdo (o superior) de la foto ampliada dentro del
 * marco. Si la foto ampliada no llena el marco en ese eje, se centra; si lo
 * llena, se coloca para que el punto de interés caiga en el ancla, sin dejar
 * nunca marco al descubierto.
 */
function place(frame: number, length: number, focus: number, z: number, anchor: number): number {
  const zl = z * length
  if (zl <= frame + 0.5) return (frame - zl) / 2
  return Math.min(0, Math.max(frame - zl, frame * anchor - z * focus * length))
}

export class Camera {
  private readonly cam: HTMLElement
  private readonly shots: Shot[] = []
  private readonly mark: HTMLElement | null
  private readonly fit: 'cover' | 'contain'
  private readonly onProgress?: (p: number) => void
  private width = 0
  private height = 0
  private progress = 0
  private raf = 0

  constructor(cam: HTMLElement, onProgress?: (p: number) => void) {
    this.cam = cam
    this.onProgress = onProgress
    this.fit = cam.dataset.fit === 'contain' ? 'contain' : 'cover'
    this.mark = cam.querySelector<HTMLElement>('.cam__mark')

    const layers = Array.from(cam.querySelectorAll<HTMLImageElement>('.cam__layer'))
    // Cada capa aporta uno o varios planos, todos del mismo peso de la capa.
    const raw: Array<{ layer: HTMLImageElement; from: Focus; to: Focus; weight: number }> = []
    for (const layer of layers) {
      const weight = Math.max(0.01, Number(layer.dataset.weight) || 1)
      if (layer.dataset.shots) {
        for (const part of layer.dataset.shots.split(';')) {
          const [a, b] = part.split('>')
          const from = parseFocus(a?.trim(), { x: 0.5, y: 0.5, z: 1 })
          raw.push({ layer, from, to: parseFocus(b?.trim(), from), weight })
        }
      } else {
        const from = parseFocus(layer.dataset.from, { x: 0.5, y: 0.5, z: 1 })
        raw.push({ layer, from, to: parseFocus(layer.dataset.to, from), weight })
      }
    }
    const total = raw.reduce((a, r) => a + r.weight, 0)
    let acc = 0
    for (const r of raw) {
      const p0 = acc / total
      acc += r.weight
      this.shots.push({ layer: r.layer, from: r.from, to: r.to, p0, p1: acc / total, lw: 0, lh: 0, ox: 0, oy: 0 })
    }

    // El marco de la cámara es el crema REAL del ciclorama de la foto maestra,
    // que mide el build: así, cuando una foto no llena el marco (la ficha
    // enseña el zapato entero en una columna vertical), lo que hay alrededor es
    // más estudio y no un rectángulo de otro tono.
    const studio = (manifest as { images?: { studio?: string } }).images?.studio
    if (studio && /^#[0-9a-f]{6}$/i.test(studio)) cam.style.setProperty('--cam-bg', studio)
  }

  init(): void {
    if (!this.shots.length) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.cam.classList.add('is-static')
      return
    }
    this.cam.classList.add('is-live')
    this.measure()
    this.render()

    // El tamaño del marco lo decide el layout (columna, banda en vertical…):
    // se vuelve a encajar cada vez que cambia, y solo entonces.
    const ro = new ResizeObserver(() => {
      this.measure()
      this.requestRender()
    })
    ro.observe(this.cam)

    // El trigger se crea cuando la sección se acerca, no al arrancar: como en
    // el plano y la punta, para no entrar en el coste del refresh inicial.
    const section = this.cam.closest<HTMLElement>('section') ?? this.cam
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return
      io.disconnect()
      this.mount(section)
    }, { rootMargin: '120% 0px 120% 0px' })
    io.observe(section)
  }

  private mount(section: HTMLElement): void {
    // Sin altura de sobra (en vertical la ficha no se ancla), el recorrido
    // pasa a ser el de los duetos: desde que asoma hasta que se va.
    const flow = this.cam.dataset.camScroll === 'flow' || section.offsetHeight < window.innerHeight * 1.2
    ScrollTrigger.create({
      trigger: section,
      start: flow ? 'top 85%' : 'top top',
      end: flow ? 'bottom 15%' : 'bottom bottom',
      scrub: 0.5,
      onUpdate: (self) => {
        this.progress = self.progress
        this.requestRender()
        this.onProgress?.(self.progress)
      },
    })
  }

  /** Encaje base de cada foto en el marco, a partir de sus medidas declaradas. */
  private measure(): void {
    this.width = this.cam.clientWidth
    this.height = this.cam.clientHeight
    const w = this.width
    const h = this.height
    if (!w || !h) return
    const done = new Set<HTMLImageElement>()
    for (const s of this.shots) {
      // Varios planos de la misma foto comparten encaje: se calcula una vez y
      // se copia, porque el estilo vive en la capa.
      const twin = this.shots.find((o) => o.layer === s.layer && done.has(o.layer))
      if (twin) { s.lw = twin.lw; s.lh = twin.lh; s.ox = twin.ox; s.oy = twin.oy; continue }
      done.add(s.layer)
      // width/height del HTML, no naturalWidth: así se encaja antes de que la
      // foto cargue y el primer plano ya está en su sitio cuando llega.
      const iw = Number(s.layer.getAttribute('width')) || s.layer.naturalWidth || 1
      const ih = Number(s.layer.getAttribute('height')) || s.layer.naturalHeight || 1
      const s0 = this.fit === 'cover' ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih)
      s.lw = iw * s0
      s.lh = ih * s0
      s.ox = (w - s.lw) / 2
      s.oy = (h - s.lh) / 2
      s.layer.style.width = `${s.lw.toFixed(2)}px`
      s.layer.style.height = `${s.lh.toFixed(2)}px`
      s.layer.style.left = `${s.ox.toFixed(2)}px`
      s.layer.style.top = `${s.oy.toFixed(2)}px`
    }
  }

  private requestRender(): void {
    if (this.raf) return
    this.raf = requestAnimationFrame(this.render)
  }

  /** Coloca una foto para que su punto de interés caiga en el ancla, con zoom z. */
  private aim(s: Shot, f: Focus): { px: number; py: number } {
    const px = place(this.width, s.lw, f.x, f.z, ANCHOR.x)
    const py = place(this.height, s.lh, f.y, f.z, ANCHOR.y)
    s.layer.style.transform =
      `translate3d(${(px - s.ox).toFixed(2)}px, ${(py - s.oy).toFixed(2)}px, 0) scale(${f.z.toFixed(4)})`
    return { px, py }
  }

  private render = (): void => {
    this.raf = 0
    if (!this.width || !this.height) return
    const p = this.progress
    const shots = this.shots
    let cur = 0
    for (let i = 0; i < shots.length; i++) if (p >= shots[i].p0) cur = i
    const s = shots[cur]
    const t = clamp01((p - s.p0) / (s.p1 - s.p0))
    const f: Focus = { x: lerp(s.from.x, s.to.x, t), y: lerp(s.from.y, s.to.y, t), z: lerp(s.from.z, s.to.z, t) }

    // El plano siguiente entra en fundido sobre el actual durante el último
    // tramo, ya colocado en su primer encuadre. Lo que queda por debajo del
    // plano actual está tapado del todo y se retira del compositor.
    const next = shots[cur + 1]
    const fadeFrom = s.p1 - (s.p1 - s.p0) * FADE
    let fading = next ? ramp(p, fadeFrom, s.p1) : 0
    // Mismo foto en el plano siguiente: no hay fundido, la cámara se desliza
    // del encuadre actual al primero del siguiente.
    const slide = next && next.layer === s.layer
    if (slide && fading > 0) {
      const k = fading * fading * (3 - 2 * fading)
      f.x = lerp(f.x, next.from.x, k); f.y = lerp(f.y, next.from.y, k); f.z = lerp(f.z, next.from.z, k)
      fading = 0
    }

    // Capa actual arriba, la que entra por encima, el resto retirado del compositor.
    const seen = new Set<HTMLImageElement>()
    shots.forEach((sh, i) => {
      const el = sh.layer
      if (seen.has(el)) return
      seen.add(el)
      if (el === s.layer) {
        el.style.visibility = 'visible'
        el.style.opacity = '1'
        el.style.zIndex = '1'
      } else if (next && el === next.layer && fading > 0 && i === cur + 1) {
        el.style.visibility = 'visible'
        el.style.opacity = fading.toFixed(3)
        el.style.zIndex = '2'
        this.aim(next, next.from)
      } else {
        el.style.visibility = 'hidden'
        el.style.opacity = '0'
        el.style.zIndex = '0'
      }
    })
    const { px, py } = this.aim(s, f)

    // La marca: aparece sobre el punto cuando el plano se ha asentado y se va
    // antes del fundido. Cae donde cae el punto de interés de verdad, no en
    // el centro: si la foto no da para centrarlo, la marca lo sigue.
    if (this.mark) {
      const mx = Math.min(this.width, Math.max(0, px + f.z * f.x * s.lw))
      const my = Math.min(this.height, Math.max(0, py + f.z * f.y * s.lh))
      const on = ramp(t, 0.18, 0.4) * (1 - ramp(t, 0.78, 0.92)) * (1 - fading)
      this.mark.style.transform = `translate3d(${mx.toFixed(1)}px, ${my.toFixed(1)}px, 0)`
      this.mark.style.opacity = on.toFixed(3)
    }
  }

  /** Para la verificación automatizada en navegador. */
  debugState(): Record<string, unknown> {
    const p = this.progress
    let cur = 0
    for (let i = 0; i < this.shots.length; i++) if (p >= this.shots[i].p0) cur = i
    return {
      id: this.cam.closest('section')?.id ?? '',
      shots: this.shots.length,
      shot: cur + 1,
      progress: Number(p.toFixed(4)),
      transform: this.shots[cur]?.layer.style.transform ?? '',
      static: this.cam.classList.contains('is-static'),
    }
  }
}

export function initCameras(bind: (section: HTMLElement) => (p: number) => void): Camera[] {
  const cams: Camera[] = []
  for (const el of document.querySelectorAll<HTMLElement>('[data-cam]')) {
    const section = el.closest<HTMLElement>('section')
    const cam = new Camera(el, section ? bind(section) : undefined)
    cam.init()
    cams.push(cam)
  }
  return cams
}
