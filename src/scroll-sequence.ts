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
interface SequenceMeta { frames: number; desktop: VariantMeta; mobile: VariantMeta }

const MANIFEST = manifest as unknown as Record<string, SequenceMeta | undefined>

const MOBILE_QUERY = '(max-width: 700px)'
const PRELOAD_CONCURRENCY = 6
/** Fase 1: uno de cada N. Fase 2: rellena el resto. */
const COARSE_STEP = 4


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
  private readonly onProgress?: (p: number) => void

  private meta: SequenceMeta | undefined
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
  progress = 0

  constructor(opts: ScrollSequenceOptions) {
    this.name = opts.name
    this.section = opts.section
    this.lengthVh = opts.lengthVh
    this.eager = opts.eager ?? false
    this.focusLandscape = opts.focusLandscape ?? 0.5
    this.onProgress = opts.onProgress

    this.pin = this.section.querySelector<HTMLElement>('.seq__pin')!
    this.canvas = this.section.querySelector<HTMLCanvasElement>('.seq__canvas')!
    this.still = this.section.querySelector<HTMLImageElement>('.seq__still')
    this.ctx = this.canvas.getContext('2d', { alpha: false })

    this.meta = MANIFEST[this.name]
  }

  init(): void {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // Sin manifest, sin canvas o con reduce-motion: imagen estática, sin pin.
    if (!this.meta || !this.ctx || reduced) {
      this.goStatic()
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

  private async preload(): Promise<void> {
    const all = Array.from({ length: this.count }, (_, i) => i)
    const coarse = all.filter((i) => i % COARSE_STEP === 0)
    if (!coarse.includes(this.count - 1)) coarse.push(this.count - 1)

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

    // Llena todo lo posible (como object-fit: cover) PERO sin recortar nunca el
    // producto. A pantalla completa en vertical, un cover puro se comería más
    // del 60% del ancho y dejaría la zapatilla sin talón ni puntera.
    const sub = this.subject
    const pw = Math.max(1, (sub.x1 - sub.x0) * iw)
    const ph = Math.max(1, (sub.y1 - sub.y0) * ih)
    const scale = Math.min(
      Math.max(w / iw, h / ih),   // cover
      w / pw,                      // el producto cabe de ancho
      h / ph                       // …y de alto
    )
    const dw = iw * scale
    const dh = ih * scale

    // Encuadra sobre el producto. En pantallas verticales lo sube al 38% de la
    // altura en vez de centrarlo: abajo va el texto y si no se solapan. En
    // apaisado lo decide la sección (el hero lo sube; la anatomía lo centra).
    const focusY = h > w ? 0.38 : this.focusLandscape
    const cx = ((sub.x0 + sub.x1) / 2) * iw * scale
    const cy = ((sub.y0 + sub.y1) / 2) * ih * scale
    const dx = dw >= w ? Math.min(0, Math.max(w - dw, w / 2 - cx)) : (w - dw) / 2
    const dy = dh >= h ? Math.min(0, Math.max(h - dh, h * focusY - cy)) : h * focusY - cy

    // El fondo del clip es casi negro puro; igualarlo hace casi invisible el borde.
    const FILL = '#070708'
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
    g.addColorStop(1, 'rgba(7, 7, 8, 0)')
    ctx.fillStyle = g
    ctx.fillRect(rx, ry, rw, rh)
  }

  private onResize = (): void => {
    this.sizeDirty = true
    this.requestPaint()
  }

  // ── Scroll ──────────────────────────────────────────────────

  private mount(): void {
    this.trigger = ScrollTrigger.create({
      trigger: this.section,
      start: 'top top',
      end: () => `+=${Math.round((window.innerHeight * this.lengthVh) / 100)}`,
      pin: this.pin,
      pinSpacing: true,
      anticipatePin: 1,
      scrub: 0.5,
      invalidateOnRefresh: true,
      onUpdate: (self) => {
        this.progress = self.progress
        const i = Math.round(self.progress * (this.count - 1))
        this.target = Math.min(this.count - 1, Math.max(0, i))
        this.requestPaint()
        this.onProgress?.(self.progress)
        if (self.progress > 0.02) this.section.classList.add('is-scrubbing')
      },
    })
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
      variant: this.variant,
      frame: this.target + 1,
      count: this.count,
      drawn: this.drawn + 1,
      loaded: this.loadedCount,
      failures: this.failures,
      progress: Number(this.progress.toFixed(4)),
      static: this.isStatic,
    }
  }
}
