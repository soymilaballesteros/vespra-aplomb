import gsap from 'gsap'
import ScrollTrigger from 'gsap/ScrollTrigger'
import manifest from './frames.manifest.json'

gsap.registerPlugin(ScrollTrigger)

type Variant = 'desktop' | 'mobile'

interface SubjectBox { x0: number; x1: number; y0: number; y1: number }
interface VariantMeta {
  count: number
  width: number
  height: number
  /** Caja del producto dentro del fotograma, en fracciones de 0 a 1. */
  subject?: SubjectBox
}
interface SequenceMeta {
  frames: number
  /**
   * Aún no hay fotogramas de esta secuencia: la sección arranca estática con su
   * imagen de respaldo y no pide ni un fotograma. Lo escribe a mano quien deja
   * el material provisional; `pnpm frames` lo borra al generar los reales.
   */
  placeholder?: boolean
  /** Color real del fondo del set, medido por el build. */
  background?: string
  desktop: VariantMeta
  mobile: VariantMeta
}

const MANIFEST = manifest as unknown as Record<string, SequenceMeta | undefined>

const MOBILE_QUERY = '(max-width: 700px)'
/**
 * Qué fracción del lienzo ocupa el PRODUCTO. En apaisado se deja sitio a la
 * columna de texto de la izquierda; en vertical el texto va debajo y el
 * producto puede respirar a lo ancho.
 */
const FILL_LANDSCAPE = { x: 0.52, y: 0.68 }
const FILL_PORTRAIT = { x: 0.86, y: 0.52 }
const PRELOAD_CONCURRENCY = 6
/**
 * Fase 1: uno de cada N. Fase 2: rellena el resto.
 *
 * 8 y no 4: con 160 fotogramas, 1 de cada 4 son 40 imágenes descodificándose
 * justo después de `load`, y en un móvil eso entra de lleno en la ventana que
 * mide el Total Blocking Time. Con 1 de cada 8 el giro ya se sigue —20 pasos en
 * una vuelta completa— y el resto llega en cuanto el usuario empieza a bajar.
 */
const COARSE_STEP = 8


/**
 * Resuelve en cuanto el usuario ha hecho scroll aunque sea una vez.
 * Sin esto, en móvil la primera secuencia queda a ~600 px del pliegue y el
 * IntersectionObserver dispara nada más cargar: cientos de KB de fotogramas
 * en la carga inicial. Si nadie hace scroll, nadie ve las secuencias.
 */
let scrolledOnce: Promise<void> | null = null
function afterFirstScroll(): Promise<void> {
  if (!scrolledOnce) {
    scrolledOnce = window.scrollY > 0
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          const done = (): void => {
            window.removeEventListener('scroll', done)
            resolve()
          }
          window.addEventListener('scroll', done, { once: true, passive: true })
        })
  }
  return scrolledOnce
}

/** Ejecuta cuando la página ha cargado y el hilo principal está ocioso. */
function afterLoad(fn: () => void): void {
  const idle = (): void => {
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback
    if (ric) ric(fn, { timeout: 1200 })
    else setTimeout(fn, 200)
  }
  if (document.readyState === 'complete') idle()
  else window.addEventListener('load', idle, { once: true })
}

export interface ScrollSequenceOptions {
  section: HTMLElement
  name: string
  /** Longitud del pin en % de la altura del viewport (300 = 300vh). */
  lengthVh: number
  /**
   * Sección visible nada más cargar (el hero). Precarga en cuanto la página
   * termina de cargar, sin esperar al primer scroll: aquí la animación ES lo
   * primero que se ve, y esperar dejaría el hero congelado.
   */
  eager?: boolean
  /**
   * Dónde cae el centro del producto en pantallas APAISADAS, de 0 (arriba) a
   * 1 (abajo). Por defecto 0.5. El hero lo sube un poco porque su texto vive
   * abajo a la izquierda y si no, la entradilla cruza el zapato por el medio.
   * En pantallas verticales manda siempre 0.38: ahí el texto va debajo.
   */
  focusLandscape?: number
  /**
   * Dónde cae el centro del producto a lo ancho, de 0 (izquierda) a 1 (derecha).
   * Por defecto 0.5. Las dos secciones lo desplazan a la derecha porque su texto
   * vive a la izquierda: con el producto centrado, el texto le cae encima.
   */
  focusX?: number
  /**
   * Cómo se encuadra el fotograma. `subject` (por defecto) dimensiona el
   * PRODUCTO a una fracción del lienzo y rellena el resto con el color del set:
   * es lo que quiere una pieza fotografiada quieta. `cover` llena el lienzo como
   * `object-fit: cover`: es lo que quiere el paso, donde la mujer recorre el
   * encuadre entero y su caja de sujeto es el ancho completo — con `subject` el
   * fotograma se encogería al 52% del ancho.
   */
  fill?: 'subject' | 'cover'
  /** Encuadre en pantallas VERTICALES, si distinto. La casa: `cover`, para que el giro siga siendo fondo. */
  fillPortrait?: 'subject' | 'cover'
  /**
   * Paneo, solo en `cover` y solo cuando el fotograma sobresale del lienzo por
   * los lados: qué punto del fotograma (0 izquierda, 1 derecha) cae en el
   * centro del lienzo al principio y al final del recorrido; entre medias se
   * interpola con el scroll. Es cómo el paso sigue a la mujer en un teléfono:
   * el lienzo es cuadrado, el clip apaisado, y ella cruza el encuadre de
   * izquierda a derecha. Sin paneo, empezaba cortada y acababa fuera.
   */
  pan?: [number, number]
  /**
   * Si la sección se FIJA (por defecto) o el lienzo vive dentro de una columna
   * `sticky` y el scrub recorre la altura natural de la sección. Es lo que usa
   * la casa: el zapato acompaña al texto sin pin.
   */
  pinned?: boolean
  /**
   * Tramo del clip que recorre esta sección, en fracciones 0-1. Por defecto
   * entero. Permite reutilizar los mismos fotogramas en varias secciones —la
   * casa cierra la vuelta con el tramo 0.72→1— y al revés (`[1, 0]`). Solo se
   * precargan los fotogramas del tramo.
   */
  range?: [number, number]
  /**
   * Qué fracción del lienzo ocupa el producto en apaisado (por defecto
   * FILL_LANDSCAPE). El hero deja aire arriba para el titular; los duetos, que
   * tienen el lienzo en una columna, lo llenan casi entero.
   */
  fillX?: number
  fillY?: number
  /**
   * Sin pin, dónde empieza y acaba el scrub (sintaxis de ScrollTrigger). Por
   * defecto 'top 85%' → 'bottom 15%' (los duetos). La casa, anclada con sticky,
   * usa 'top top' → 'bottom bottom'; la cita, 'top 70%' → 'bottom bottom'.
   */
  start?: string
  end?: string
  /**
   * Lienzo TRANSPARENTE: no rellena con el color del set ni funde cantos; lo que
   * hay detrás (el papel, el titular) se ve alrededor del producto. Solo tiene
   * sentido con fotogramas recortados (con alfa, `cut` en el build).
   */
  transparent?: boolean
  onProgress?: (progress: number) => void
}

export class ScrollSequence {
  readonly name: string
  private readonly section: HTMLElement
  private readonly pin: HTMLElement
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D | null
  private readonly still: HTMLImageElement | null
  private readonly lengthVh: number
  private readonly eager: boolean
  private readonly focusLandscape: number
  private readonly focusX: number
  private readonly fillMode: 'subject' | 'cover'
  private readonly fillPortrait?: 'subject' | 'cover'
  private readonly pan?: [number, number]
  private readonly pinned: boolean
  private readonly range: [number, number]
  private readonly fillX?: number
  private readonly fillY?: number
  private readonly start?: string
  private readonly end?: string
  private readonly transparent: boolean
  private readonly onProgress?: (p: number) => void

  private meta: SequenceMeta | undefined
  /** Color del set, y el mismo en rgba con alfa 0 para los degradados. */
  private fill = '#F1EAE0'
  private fillClear = 'rgba(241, 234, 224, 0)'
  private variant: Variant = 'desktop'
  private count = 0
  private subject: SubjectBox = { x0: 0, x1: 1, y0: 0, y1: 1 }

  private images: (HTMLImageElement | null)[] = []
  private pending = new Set<number>()
  private loadedCount = 0
  private failures = 0

  private target = 0
  /** Índice del frame REALMENTE pintado. Si no coincide con el objetivo, hay que repintar. */
  private drawn = -1
  private sizeDirty = true
  private raf = 0

  private trigger?: ScrollTrigger
  private mq?: MediaQueryList
  private isStatic = false
  private isPlaceholder = false
  progress = 0

  constructor(opts: ScrollSequenceOptions) {
    this.name = opts.name
    this.section = opts.section
    this.lengthVh = opts.lengthVh
    this.eager = opts.eager ?? false
    this.focusLandscape = opts.focusLandscape ?? 0.5
    this.focusX = opts.focusX ?? 0.5
    this.fillMode = opts.fill ?? 'subject'
    this.fillPortrait = opts.fillPortrait
    this.pan = opts.pan
    this.pinned = opts.pinned ?? true
    this.range = opts.range ?? [0, 1]
    this.fillX = opts.fillX
    this.fillY = opts.fillY
    this.start = opts.start
    this.end = opts.end
    this.transparent = opts.transparent ?? false
    this.onProgress = opts.onProgress

    this.pin = this.section.querySelector<HTMLElement>('.seq__pin')!
    this.canvas = this.section.querySelector<HTMLCanvasElement>('.seq__canvas')!
    this.still = this.section.querySelector<HTMLImageElement>('.seq__still')
    this.ctx = this.canvas.getContext('2d', { alpha: this.transparent })

    this.meta = MANIFEST[this.name]

    // El relleno del lienzo y el fundido de sus cantos usan el color REAL del
    // fondo del set, que mide el build. Escrito a mano en el CSS, cualquier
    // cambio de set deja una costura donde termina la imagen.
    const bg = this.meta?.background
    if (bg && /^#[0-9a-f]{6}$/i.test(bg)) {
      this.fill = bg
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(bg.slice(i, i + 2), 16))
      this.fillClear = `rgba(${r}, ${g}, ${b}, 0)`
    }
    // Sin pin el lienzo vive sobre el papel de la página, no sobre su propio
    // escenario: el relleno y el fundido de cantos tienen que ser el color del
    // papel, o el fotograma se lee como un rectángulo un punto más oscuro.
    if (!this.pinned) {
      const page = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
      if (/^#[0-9a-f]{6}$/i.test(page)) {
        this.fill = page
        const [r, g, b] = [1, 3, 5].map((i) => parseInt(page.slice(i, i + 2), 16))
        this.fillClear = `rgba(${r}, ${g}, ${b}, 0)`
      }
    }
    // El CSS lo necesita para pintar el escenario ANTES de que el lienzo tenga
    // nada: si no, se ve un destello del fondo de la página al entrar.
    this.section.style.setProperty('--seq-bg', this.transparent ? 'transparent' : this.fill)
  }

  init(): void {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // Sin manifest, sin canvas o con reduce-motion: imagen estática, sin pin.
    if (!this.meta || !this.ctx || reduced) {
      this.goStatic()
      return
    }
    // Material provisional: imagen estática, sin pedir un solo fotograma, pero
    // conservando la coreografía del texto (pin e hitos) para poder revisarla.
    if (!this.meta.frames || this.meta.placeholder) {
      this.goPlaceholder()
      return
    }

    this.mq = window.matchMedia(MOBILE_QUERY)
    this.applyVariant(this.mq.matches ? 'mobile' : 'desktop')
    this.mq.addEventListener('change', this.onVariantChange)

    this.primeFromPoster()
    this.mount()
    this.watchViewport()
    window.addEventListener('resize', this.onResize, { passive: true })
  }

  /**
   * Pinta en el lienzo la imagen del póster usando exactamente el mismo
   * encuadre que usará con los fotogramas. Así el relevo del <img> al <canvas>
   * no produce ningún salto de tamaño ni de posición.
   */
  private primeFromPoster(): void {
    const img = this.section.querySelector<HTMLImageElement>('.hero__poster img')
    if (!img) return
    const show = (): void => {
      if (!img.naturalWidth) return
      this.drawImage(img)
      this.section.classList.add('is-primed')
    }
    if (img.complete) show()
    else img.addEventListener('load', show, { once: true })
  }

  // ── Carga ────────────────────────────────────────────────────

  private applyVariant(variant: Variant): void {
    this.variant = variant
    const v = this.meta![variant]
    this.count = v.count || this.meta!.frames
    this.subject = v.subject ?? { x0: 0, x1: 1, y0: 0, y1: 1 }
    // El CSS necesita la proporción REAL del juego activo para dibujar la banda
    // en pantallas verticales sin que `cover` recorte nada.
    this.section.style.setProperty('--seq-ratio', String(v.width / v.height))
    this.images = new Array(this.count).fill(null)
    this.pending.clear()
    this.loadedCount = 0
    this.failures = 0
    this.drawn = -1
    this.sizeDirty = true
    // El objetivo arranca en el principio del TRAMO, no en el fotograma 0:
    // hasta que el scroll mueve el trigger no hay onUpdate, y una sección con
    // tramo 0.45→0.72 pintaría (y declararía) el fotograma equivocado.
    this.target = Math.min(this.count - 1, Math.max(0, Math.round(this.range[0] * (this.count - 1))))
  }

  private onVariantChange = (e: MediaQueryListEvent): void => {
    this.applyVariant(e.matches ? 'mobile' : 'desktop')
    void this.preload()
    ScrollTrigger.refresh()
  }

  private url(i: number): string {
    const n = String(i + 1).padStart(4, '0')
    return `/frames/${this.name}/${this.variant}/frame-${n}.webp`
  }

  /**
   * La precarga exige TRES condiciones: que la sección esté cerca del viewport,
   * que el usuario haya hecho scroll y que la página haya terminado de cargar.
   * Las secuencias no participan nunca de la carga inicial ni compiten con el LCP.
   */
  private watchViewport(): void {
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        io.disconnect()
        if (this.eager) afterLoad(() => void this.preload())
        else void afterFirstScroll().then(() => afterLoad(() => void this.preload()))
      },
      { rootMargin: '150% 0px 150% 0px' }
    )
    io.observe(this.section)
  }

  private async loadOne(i: number): Promise<void> {
    if (this.images[i] || this.pending.has(i)) return
    this.pending.add(i)
    const img = new Image()
    img.decoding = 'async'
    img.src = this.url(i)
    try {
      await img.decode()
      this.images[i] = img
      this.loadedCount++
      // Mientras el fotograma pintado no sea el que toca, cada carga nueva pide
      // repintado. Sin esto, si entras en la sección antes de que haya cargado
      // nada, se pinta el fotograma más cercano como aproximación y el lienzo
      // se queda ahí para siempre: nada vuelve a pedir que se repinte.
      if (this.drawn !== this.target) this.requestPaint()
    } catch {
      this.failures++
    } finally {
      this.pending.delete(i)
    }
  }

  private async runQueue(indices: number[]): Promise<void> {
    let next = 0
    const worker = async (): Promise<void> => {
      while (next < indices.length) await this.loadOne(indices[next++])
    }
    await Promise.all(Array.from({ length: PRELOAD_CONCURRENCY }, worker))
  }

  /** Índices de fotograma que cubre el tramo de esta sección. */
  private wanted(): number[] {
    const [a, b] = this.range
    const lo = Math.max(0, Math.floor(Math.min(a, b) * (this.count - 1)))
    const hi = Math.min(this.count - 1, Math.ceil(Math.max(a, b) * (this.count - 1)))
    return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
  }

  private async preload(): Promise<void> {
    const all = this.wanted()
    const coarse = all.filter((i) => i % COARSE_STEP === 0)
    const last = all[all.length - 1]
    if (!coarse.includes(last)) coarse.push(last)

    await this.runQueue(coarse)

    // Si la pasada gruesa falló entera, son 404: pasa a estático en vez de
    // dejar un canvas congelado (este fue el fallo del intento anterior).
    if (this.loadedCount === 0) {
      console.error(`[seq:${this.name}] ningún frame cargó desde ${this.url(0)}`)
      this.goStatic()
      return
    }
    this.section.classList.add('is-ready')

    // El relleno fino espera al primer scroll. En el hero la pasada gruesa
    // tiene que entrar ya (la animación es lo primero que se ve), pero bajar
    // los 100 fotogramas antes de que nadie toque el scroll son ~840 KB de
    // carga inicial. Con 1 de cada 4 el giro ya se sigue; el resto llega en
    // cuanto el usuario empieza a bajar, que es justo cuando hace falta.
    if (this.eager) await afterFirstScroll()
    await this.runQueue(all.filter((i) => i % COARSE_STEP !== 0))
  }

  // ── Pintado ─────────────────────────────────────────────────

  /** Frame cargado más cercano al objetivo, para no dejar hueco durante la precarga. */
  private nearest(i: number): { img: HTMLImageElement; index: number } | null {
    if (this.images[i]) return { img: this.images[i]!, index: i }
    for (let d = 1; d < this.count; d++) {
      const lo = i - d
      const hi = i + d
      if (lo >= 0 && this.images[lo]) return { img: this.images[lo]!, index: lo }
      if (hi < this.count && this.images[hi]) return { img: this.images[hi]!, index: hi }
    }
    return null
  }

  private requestPaint(): void {
    if (this.raf) return
    this.raf = requestAnimationFrame(this.paint)
  }

  private paint = (): void => {
    this.raf = 0
    const ctx = this.ctx
    if (!ctx) return

    const found = this.nearest(this.target)
    if (!found) return
    if (found.index === this.drawn && !this.sizeDirty) return

    // Lienzo sin tamaño (sección oculta o aún sin layout): no marques el
    // fotograma como pintado o no volvería a repintarse nunca.
    if (this.canvas.clientWidth === 0 || this.canvas.clientHeight === 0) return
    this.sizeDirty = false
    this.drawImage(found.img)
    this.drawn = found.index
  }

  /** Encuadra y pinta una imagen en el lienzo. */
  private drawImage(img: HTMLImageElement): void {
    const ctx = this.ctx
    if (!ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = Math.round(this.canvas.clientWidth * dpr)
    const h = Math.round(this.canvas.clientHeight * dpr)
    if (w === 0 || h === 0) return
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w
      this.canvas.height = h
    }
    const iw = img.naturalWidth
    const ih = img.naturalHeight

    // El producto se dimensiona por SÍ MISMO, no por llenar la pantalla.
    //
    // Antes se escalaba como `object-fit: cover`, y con el encuadre cerrado que
    // produce ahora el build (el zapato llena el 88% del fotograma) eso dejaba
    // el zapato ocupando el 98% del ancho del viewport: una macro, no una foto
    // de producto. Se puede prescindir del cover porque el relleno del lienzo
    // ya es el color REAL del ciclorama: lo que sobra alrededor no es un borde
    // negro, es más fondo de estudio. Así el objeto tiene aire, que es la mitad
    // de lo que hace que una foto se lea como de campaña.
    const sub = this.subject
    const pw = Math.max(1, (sub.x1 - sub.x0) * iw)
    const ph = Math.max(1, (sub.y1 - sub.y0) * ih)
    const portrait = h > w
    const fillX = portrait ? FILL_PORTRAIT.x : (this.fillX ?? FILL_LANDSCAPE.x)
    const fillY = portrait ? FILL_PORTRAIT.y : (this.fillY ?? FILL_LANDSCAPE.y)
    const mode = portrait && this.fillPortrait ? this.fillPortrait : this.fillMode
    const scale = mode === 'cover'
      ? Math.max(w / iw, h / ih)
      : Math.min((w * fillX) / pw, (h * fillY) / ph)
    const dw = iw * scale
    const dh = ih * scale

    // Encuadra sobre el producto. En pantallas verticales lo sube al 38% de la
    // altura en vez de centrarlo: abajo va el texto y si no se solapan. En
    // apaisado lo decide la sección (el hero lo sube; la anatomía lo centra).
    const focusY = h > w ? 0.38 : this.focusLandscape
    // En vertical el producto se centra a lo ancho: el texto va debajo, no al lado.
    const focusX = h > w ? 0.5 : this.focusX
    const cx = ((sub.x0 + sub.x1) / 2) * iw * scale
    const cy = ((sub.y0 + sub.y1) / 2) * ih * scale
    let dx = dw >= w ? Math.min(0, Math.max(w - dw, w * focusX - cx)) : w * focusX - cx
    if (this.pan && mode === 'cover' && dw > w) {
      // El punto del fotograma que toca estar en el centro, según el progreso.
      // Con arranque suave (p^1.6): la mujer del paso tarda en echar a andar
      // y una cámara lineal se le adelantaba y la dejaba a la izquierda.
      const t = Math.pow(this.progress, 1.6)
      const px = this.pan[0] + (this.pan[1] - this.pan[0]) * t
      dx = Math.min(0, Math.max(w - dw, w / 2 - px * dw))
    }
    const dy = dh >= h ? Math.min(0, Math.max(h - dh, h * focusY - cy)) : h * focusY - cy

    if (this.transparent) {
      // Fotogramas con alfa sobre lienzo transparente: ni relleno ni fundidos.
      ctx.clearRect(0, 0, w, h)
      ctx.drawImage(img, dx, dy, dw, dh)
      return
    }
    const FILL = this.fill
    ctx.fillStyle = FILL
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(img, dx, dy, dw, dh)

    // El suelo del estudio es algo más claro que el relleno, así que donde
    // termina la imagen se ve una costura. Se funde con un degradado corto —
    // en los CUATRO cantos, no solo arriba y abajo: cuando el fotograma es más
    // estrecho que el lienzo (dw < w), las costuras que se ven son las de los
    // lados. Con un 16:9 a sangre eso no pasaba nunca y por eso no se notaba.
    const FADE = Math.round(Math.min(h, w) * 0.12)
    if (dy > 0) this.fadeEdge(ctx, 0, dy, w, FADE, 0, dy, 0, dy + FADE, FILL)
    if (dy + dh < h) this.fadeEdge(ctx, 0, dy + dh - FADE, w, FADE, 0, dy + dh, 0, dy + dh - FADE, FILL)
    if (dx > 0) this.fadeEdge(ctx, dx, 0, FADE, h, dx, 0, dx + FADE, 0, FILL)
    if (dx + dw < w) this.fadeEdge(ctx, dx + dw - FADE, 0, FADE, h, dx + dw, 0, dx + dw - FADE, 0, FILL)
  }

  /**
   * Degradado del color de relleno hacia transparente sobre un canto.
   * `rect` es la banda que se pinta; `from`→`to` la dirección del degradado,
   * que arranca opaco EN la costura y se apaga hacia dentro de la imagen.
   */
  private fadeEdge(
    ctx: CanvasRenderingContext2D,
    rx: number, ry: number, rw: number, rh: number,
    fx: number, fy: number, tx: number, ty: number,
    color: string
  ): void {
    const g = ctx.createLinearGradient(fx, fy, tx, ty)
    g.addColorStop(0, color)
    g.addColorStop(1, this.fillClear)
    ctx.fillStyle = g
    ctx.fillRect(rx, ry, rw, rh)
  }

  private onResize = (): void => {
    this.sizeDirty = true
    this.requestPaint()
  }

  // ── Scroll ──────────────────────────────────────────────────

  private mount(): void {
    const pinned = this.pinned
    this.section.classList.add('is-pinned')
    this.trigger = ScrollTrigger.create({
      trigger: this.section,
      // Sin pin, el scrub recorre la sección desde que asoma por abajo hasta
      // que se va por arriba: el zapato se mueve mientras el texto pasa.
      start: pinned ? 'top top' : (this.start ?? 'top 85%'),
      end: pinned
        ? () => `+=${Math.round((window.innerHeight * this.lengthVh) / 100)}`
        : (this.end ?? 'bottom 15%'),
      pin: pinned ? this.pin : false,
      pinSpacing: pinned,
      anticipatePin: pinned ? 1 : 0,
      scrub: 0.5,
      invalidateOnRefresh: true,
      onUpdate: (self) => {
        this.progress = self.progress
        if (this.count > 0) {
          const [a, b] = this.range
          const f = a + self.progress * (b - a)
          const i = Math.round(f * (this.count - 1))
          this.target = Math.min(this.count - 1, Math.max(0, i))
          this.requestPaint()
        }
        this.onProgress?.(self.progress)
        if (self.progress > 0.02) this.section.classList.add('is-scrubbing')
      },
    })
  }

  /**
   * Material provisional: la sección enseña su imagen de respaldo y no pide
   * fotogramas, pero si tiene hitos (o está fijada por diseño) conserva el pin
   * y el scrub para que el texto haga su coreografía. Así la web se puede
   * revisar entera antes de que existan los clips.
   */
  private goPlaceholder(): void {
    this.isStatic = true
    this.isPlaceholder = true
    this.count = 0
    this.section.classList.add('is-static', 'is-placeholder')
    if (this.still) this.still.hidden = false
    const choreographed = this.pinned && this.section.querySelector('.beat') !== null
    if (choreographed) this.mount()
  }

  private goStatic(): void {
    this.isStatic = true
    this.section.classList.add('is-static')
    // La imagen de respaldo la muestra el CSS con la clase `is-static`;
    // hasta entonces está en display:none y ni siquiera se descarga.
    if (this.still) this.still.hidden = false
    this.trigger?.kill()
    this.trigger = undefined
  }

  // ── HUD ─────────────────────────────────────────────────────

  debugLine(): string {
    if (this.isPlaceholder) return `${this.name.padEnd(8)} PROVISIONAL · ${(this.progress * 100).toFixed(1)}%`
    if (this.isStatic) return `${this.name.padEnd(8)} ESTÁTICO (fallback)`
    return (
      `${this.name.padEnd(8)} ${this.variant.padEnd(7)} ` +
      `frame ${String(this.target + 1).padStart(3)}/${this.count} · ` +
      `cargados ${String(this.loadedCount).padStart(3)}/${this.count}` +
      (this.failures ? ` · fallos ${this.failures}` : '') +
      ` · ${(this.progress * 100).toFixed(1)}%`
    )
  }

  /** Para la verificación automatizada en navegador. */
  debugState(): Record<string, unknown> {
    return {
      name: this.name,
      id: this.section.id,
      variant: this.variant,
      frame: this.target + 1,
      count: this.count,
      drawn: this.drawn + 1,
      loaded: this.loadedCount,
      failures: this.failures,
      progress: Number(this.progress.toFixed(4)),
      static: this.isStatic,
      placeholder: this.isPlaceholder,
      pinned: this.pinned,
      wanted: this.count ? this.wanted().length : 0,
      coarseStep: COARSE_STEP,
    }
  }
}
