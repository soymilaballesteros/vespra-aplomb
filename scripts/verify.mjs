#!/usr/bin/env node
/**
 * verify.mjs — comprueba, contra el build de PRODUCCIÓN, que la web cumple.
 *
 *   pnpm verify              arranca `vite preview`, verifica y lo para
 *   pnpm verify --url http://localhost:4173     contra un servidor ya en marcha
 *
 * No sustituye a Lighthouse: mide lo que Lighthouse no puede ver, que es si la
 * animación de verdad AVANZA. La trampa de esta técnica es que el lienzo se
 * quede congelado en un fotograma y las capturas de pantalla salgan bien igual.
 * Por eso aquí se compara una HUELLA de los píxeles del lienzo en cinco puntos
 * del recorrido: si las cinco coinciden, no se está moviendo nada.
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { chromium } from 'playwright'

const ROOT = path.resolve(import.meta.dirname, '..')
const DEFAULT_URL = 'http://localhost:4173'
const STOPS = [0, 0.25, 0.5, 0.75, 1]
const VIEWPORTS = [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'móvil', width: 390, height: 844 },
]
/** Presupuesto de carga inicial, antes de que nadie haga scroll. */
const INITIAL_BUDGET = 1024 * 1024

const args = process.argv.slice(2)
const urlArg = args.indexOf('--url')
const URL = urlArg >= 0 ? args[urlArg + 1] : DEFAULT_URL

let failures = 0
let provisional = 0
const ok = (msg) => console.log(`  \x1b[32m✓\x1b[0m ${msg}`)
const warn = (msg) => { provisional++; console.log(`  \x1b[33m⚠︎\x1b[0m ${msg}`) }
const bad = (msg) => { failures++; console.log(`  \x1b[31m✗\x1b[0m ${msg}`) }
const head = (msg) => console.log(`\n\x1b[1m${msg}\x1b[0m`)

// ── Servidor ────────────────────────────────────────────────────────────
async function startPreview() {
  if (urlArg >= 0) return null
  const proc = spawn('npx', ['vite', 'preview', '--port', '4173'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
  })
  let died = null
  proc.on('exit', (code) => { died = code })

  // Se sondea la URL en vez de leer la salida del proceso: el formato de lo que
  // imprime vite cambia entre versiones y quedarse esperando una cadena concreta
  // hace que el script falle sin que la web tenga nada malo.
  const deadline = Date.now() + 25000
  for (;;) {
    if (died !== null) throw new Error(`vite preview salió con ${died}`)
    try {
      const res = await fetch(DEFAULT_URL, { method: 'HEAD' })
      if (res.ok) return proc
    } catch { /* aún no escucha */ }
    if (Date.now() > deadline) {
      proc.kill()
      throw new Error('vite preview no respondió en 25 s. ¿Has hecho `pnpm build`?')
    }
    await new Promise((r) => setTimeout(r, 300))
  }
}

// ── Huella de los píxeles del lienzo ────────────────────────────────────
/**
 * Redibuja el lienzo en uno de 24x14 y hace FNV-1a sobre los bytes. Dos
 * fotogramas distintos de un giro dan huellas distintas incluso a esa
 * resolución; el mismo fotograma da siempre la misma.
 */
const CANVAS_HASH = `(sel) => {
  const src = document.querySelector(sel)
  const c = document.createElement('canvas')
  c.width = 24; c.height = 14
  const g = c.getContext('2d')
  g.drawImage(src, 0, 0, 24, 14)
  const d = g.getImageData(0, 0, 24, 14).data
  let h = 2166136261
  for (let i = 0; i < d.length; i++) { h ^= d[i]; h = Math.imul(h, 16777619) }
  return (h >>> 0).toString(16)
}`

/**
 * Espera a que una secuencia haya terminado de precargar.
 *
 * Sin esto, la comprobación de "objetivo == pintado" mide un estado transitorio
 * perfectamente correcto: mientras la precarga avanza, el lienzo pinta a
 * propósito el fotograma cargado más cercano para no quedarse en blanco. Lo que
 * hay que verificar es el estado estable.
 */
async function waitLoaded(page, id) {
  const ok = await page.evaluate(async (sectionId) => {
    const deadline = Date.now() + 45000
    for (;;) {
      const s = window.__seq().find((x) => x.id === sectionId)
      if (s && (s.loaded + s.failures) >= (s.wanted || s.count)) return true
      if (Date.now() > deadline) return false
      await new Promise((r) => setTimeout(r, 250))
    }
  }, id)
  return ok
}

async function sequenceStops(page, id) {
  return page.evaluate(async ({ id, stops, hashFn }) => {
    const hash = eval(hashFn)
    const section = document.getElementById(id)
    const top = section.getBoundingClientRect().top + window.scrollY
    const vh = window.innerHeight
    // Fijada: el recorrido es data-length. Sin pin: desde que asoma por abajo
    // (top 85%) hasta que se va por arriba (bottom 15%), como en el runtime.
    const pinned = section.dataset.pin !== 'none'
    const start = pinned ? top : top - vh * 0.85
    const length = pinned
      ? (Number(section.dataset.length) || 300) * vh / 100
      : section.offsetHeight - vh * 0.7
    const out = []
    for (const p of stops) {
      window.scrollTo({ top: start + p * length, behavior: 'instant' })
      // El scrub es 0.5: hay que dejar que se asiente o se mide a medio camino.
      await new Promise((r) => setTimeout(r, 900))
      const state = window.__seq().find((s) => s.id === id)
      out.push({
        p,
        hash: hash(`#${id} .seq__canvas`),
        frame: state.frame,
        drawn: state.drawn,
        progress: state.progress,
        failures: state.failures,
      })
    }
    return out
  }, { id, stops: STOPS, hashFn: CANVAS_HASH })
}

// ── A · la animación se ve ──────────────────────────────────────────────
async function checkSequences(page, label) {
  const ids = await page.evaluate(() =>
    [...document.querySelectorAll('.seq[data-seq]')].map((s) => s.id))

  for (const id of ids) {
    const name = await page.evaluate((i) => document.getElementById(i).dataset.seq, id)
    // Material provisional (frames: 0 en el manifest): la sección es estática a
    // propósito y no hay animación que medir. Se avisa, no se falla: la web tiene
    // que poder revisarse antes de que existan los clips.
    const state = await page.evaluate((i) => window.__seq().find((s) => s.id === i), id)
    if (state?.placeholder) {
      warn(`${label} · ${id}: MATERIAL PROVISIONAL — sin fotogramas, sección estática (falta el clip "${name}")`)
      continue
    }
    // Entrar EN la sección, no justo antes: el hero empieza en 0 y un
    // scrollTo(0) no dispara evento de scroll, así que su fase fina —que espera
    // al primer scroll a propósito— no arrancaría nunca y el test se colgaría
    // esperando una precarga que el propio test ha impedido.
    await page.evaluate((i) => {
      const el = document.getElementById(i)
      window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY + 300)
    }, id)
    if (await waitLoaded(page, id)) ok(`${label} · ${id}: precarga completa`)
    else bad(`${label} · ${id}: la precarga no terminó en 45 s`)

    const down = await sequenceStops(page, id)
    const hashes = down.map((s) => s.hash)
    const unique = new Set(hashes)

    if (unique.size === STOPS.length) ok(`${label} · ${id}: ${unique.size}/5 huellas distintas`)
    else bad(`${label} · ${id}: solo ${unique.size}/5 huellas distintas — el lienzo no avanza (${hashes.join(' ')})`)

    const stuck = down.filter((s) => s.frame !== s.drawn)
    if (!stuck.length) ok(`${label} · ${id}: el fotograma pintado coincide con el objetivo en los 5 puntos`)
    else bad(`${label} · ${id}: objetivo≠pintado en ${stuck.map((s) => `${Math.round(s.p * 100)}% (${s.frame}≠${s.drawn})`).join(', ')} — falta pedir repintado al cargar`)

    const drift = down.filter((s) => Math.abs(s.progress - s.p) > 0.06)
    if (drift.length) bad(`${label} · ${id}: el progreso no llega a donde se le pide (${drift.map((s) => `${s.p}→${s.progress}`).join(', ')})`)

    const lost = down.reduce((n, s) => n + s.failures, 0)
    if (lost) bad(`${label} · ${id}: ${lost} fotogramas no cargaron`)

    // Ida y vuelta: subir y volver a bajar tiene que dar las mismas huellas.
    const up = (await sequenceStops(page, id)).map((s) => s.hash)
    if (up.join() === hashes.join()) ok(`${label} · ${id}: la vuelta reproduce las mismas huellas`)
    else bad(`${label} · ${id}: la vuelta no coincide con la ida`)
  }
}

// ── C · márgenes y zonas táctiles ───────────────────────────────────────
async function checkLayout(page, label, narrow) {
  const r = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    const blocks = ['.manifesto', '.plan', '.atelier', '.spec', '.heritage', '.collection', '.request', '.footer']
    // Se mide el RELLENO de la sección, no la caja del primer hijo: casi todos
    // los bloques llevan su propia medida máxima (max-width) y comparar su borde
    // derecho con el del viewport daba desigualdades que no existen.
    const margins = blocks.map((sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const cs = getComputedStyle(el)
      return { sel, left: Math.round(parseFloat(cs.paddingLeft)), right: Math.round(parseFloat(cs.paddingRight)) }
    }).filter(Boolean)

    // Un elemento con un antepasado recortado no puede desbordar aunque su caja
    // geométrica caiga fuera: es lo que pasa con las cotas del plano en móvil.
    const clipped = (el) => {
      for (let n = el.parentElement; n; n = n.parentElement) {
        const o = getComputedStyle(n)
        if (o.overflowX === 'hidden' || o.overflow === 'hidden') return true
      }
      return false
    }
    const name = (el) => {
      const c = typeof el.className === 'string' ? el.className : el.className?.baseVal
      return `${el.tagName.toLowerCase()}${c ? '.' + String(c).split(' ')[0] : ''}`
    }
    const overflow = [...document.querySelectorAll('body *')]
      .filter((el) => el instanceof HTMLElement && !clipped(el))
      .filter((el) => {
        const b = el.getBoundingClientRect()
        return b.width > 0 && (b.right > vw + 1 || b.left < -1)
      })
      .slice(0, 6)
      .map(name)

    const small = [...document.querySelectorAll('a, button, input')]
      .map((el) => ({ el, b: el.getBoundingClientRect() }))
      .filter(({ b }) => b.width > 0 && b.height > 0 && b.height < 44)
      .slice(0, 6)
      .map(({ el, b }) => `${name(el)} ${Math.round(b.height)}px`)

    return { vw, docW: document.documentElement.scrollWidth, margins, overflow, small }
  })

  // Todos los bloques tienen que colgar del MISMO raíl. Es el fallo que en
  // escritorio hacía que las secciones se cortaran antes que la barra.
  const lefts = new Set(r.margins.map((m) => m.left))
  const rights = new Set(r.margins.map((m) => m.right))
  if (lefts.size === 1 && rights.size === 1) ok(`${label} · los ${r.margins.length} bloques comparten raíl (${[...lefts][0]}/${[...rights][0]})`)
  else bad(`${label} · raíles distintos entre bloques: ${r.margins.map((m) => `${m.sel} ${m.left}/${m.right}`).join(', ')}`)

  // En escritorio la sangría izquierda es MAYOR a propósito: el contenido
  // cuelga de la espina. En móvil no hay espina, así que tienen que coincidir.
  if (narrow) {
    const m = r.margins[0]
    if (m && Math.abs(m.left - m.right) <= 2) ok(`${label} · márgenes izquierdo y derecho iguales (${m.left}/${m.right})`)
    else bad(`${label} · sin espina visible los márgenes deberían coincidir: ${m.left}/${m.right}`)
  }

  if (r.docW <= r.vw) ok(`${label} · sin scroll horizontal`)
  else bad(`${label} · el documento mide ${r.docW}px en un viewport de ${r.vw}px`)

  if (!r.overflow.length) ok(`${label} · ningún elemento desbordado`)
  else bad(`${label} · desbordan: ${r.overflow.join(', ')}`)

  if (!r.small.length) ok(`${label} · zonas táctiles ≥ 44 px`)
  else bad(`${label} · zonas táctiles pequeñas: ${r.small.join(', ')}`)
}

// ── Pasada por un viewport ──────────────────────────────────────────────
async function runViewport(browser, vp) {
  head(`${vp.name} · ${vp.width}×${vp.height}`)
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
  const page = await context.newPage()

  const errors = []
  const notFound = []
  let initialBytes = 0
  let loaded = false
  let scrolled = false
  const framesBeforeLoad = []
  const framesBeforeScroll = []

  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('response', (res) => {
    const u = res.url()
    if (res.status() === 404) notFound.push(u)
    if (u.includes('/frames/')) {
      if (!loaded) framesBeforeLoad.push(u)
      if (!scrolled) framesBeforeScroll.push(u)
      return
    }
    if (!loaded) initialBytes += Number(res.headers()['content-length'] || 0)
  })

  await page.goto(URL, { waitUntil: 'load' })
  loaded = true
  await page.waitForTimeout(2500)

  // B · carga inicial. Las secuencias NO participan de ella.
  if (!framesBeforeLoad.length) ok(`${vp.name} · cero fotogramas antes del evento load`)
  else bad(`${vp.name} · ${framesBeforeLoad.length} fotogramas descargados antes de load — compiten con el LCP`)

  // Tras load y antes de que nadie toque el scroll, solo el hero tiene permiso,
  // y solo su pasada gruesa (1 de cada COARSE_STEP). Es lo primero que se ve: esperar al
  // scroll dejaría el hero congelado. Cualquier otra secuencia aquí es un fallo.
  const early = framesBeforeScroll.filter((u) => !u.includes('/frames/rotate/'))
  if (!early.length) ok(`${vp.name} · antes del scroll solo carga el hero (${framesBeforeScroll.length} fotogramas, pasada gruesa)`)
  else bad(`${vp.name} · ${early.length} fotogramas de secuencias que no son el hero antes del primer scroll`)

  const coarseCap = await page.evaluate(() => {
    const s = window.__seq().find((x) => x.name === 'rotate')
    return s && s.count ? Math.ceil(s.count / (s.coarseStep || 8)) + 4 : 0
  })
  if (framesBeforeScroll.length <= coarseCap) ok(`${vp.name} · la pasada gruesa se queda en ${framesBeforeScroll.length} (tope ${coarseCap})`)
  else bad(`${vp.name} · ${framesBeforeScroll.length} fotogramas antes del scroll, por encima de la pasada gruesa (${coarseCap})`)

  const kb = (n) => `${(n / 1024).toFixed(0)} KB`
  if (initialBytes <= INITIAL_BUDGET) ok(`${vp.name} · carga inicial ${kb(initialBytes)} (tope ${kb(INITIAL_BUDGET)})`)
  else bad(`${vp.name} · carga inicial ${kb(initialBytes)}, por encima del tope de ${kb(INITIAL_BUDGET)}`)

  const lcp = await page.evaluate(() => new Promise((resolve) => {
    let last = null
    new PerformanceObserver((list) => { last = list.getEntries().at(-1) })
      .observe({ type: 'largest-contentful-paint', buffered: true })
    setTimeout(() => resolve(last ? {
      tag: last.element?.tagName ?? '?',
      cls: last.element?.className ?? '',
      time: Math.round(last.startTime),
    } : null), 300)
  }))
  if (!lcp) bad(`${vp.name} · no se pudo medir el LCP`)
  else if (lcp.tag === 'CANVAS') bad(`${vp.name} · el LCP es el lienzo (${lcp.time} ms) — debería ser el póster o un texto`)
  else ok(`${vp.name} · LCP ${lcp.tag}${lcp.cls ? `.${String(lcp.cls).split(' ')[0]}` : ''} a ${lcp.time} ms`)

  scrolled = true
  await checkLayout(page, vp.name, vp.width <= 700)
  await checkSequences(page, vp.name)

  // Barrido de arriba abajo: sin esto, las imágenes con loading="lazy" que
  // nunca entran en pantalla no se piden y un 404 suyo pasaría desapercibido.
  await page.evaluate(async () => {
    const step = window.innerHeight * 0.8
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo({ top: y, behavior: 'instant' })
      await new Promise((r) => setTimeout(r, 120))
    }
  })
  await page.waitForTimeout(1200)

  // OJO: `vite preview` responde 200 con el index.html a cualquier ruta que no
  // existe, así que un fichero que falta NO sale como 404. La comprobación que
  // no se puede engañar es preguntarle al navegador si la imagen decodificó.
  const broken = await page.evaluate(() =>
    [...document.querySelectorAll('img')]
      .filter((i) => i.complete && i.naturalWidth === 0)
      .map((i) => new URL(i.currentSrc || i.src).pathname))
  if (!broken.length) ok(`${vp.name} · las ${await page.evaluate(() => document.images.length)} imágenes cargan`)
  else bad(`${vp.name} · ${broken.length} imágenes rotas: ${broken.join(', ')}`)

  // Los atributos width/height reservan el espacio antes de que llegue la
  // imagen. Si mienten sobre la proporción, el navegador reserva una caja de
  // otra forma y todo salta al cargar (CLS). Se compara con la imagen real.
  const misdeclared = await page.evaluate(() =>
    [...document.querySelectorAll('img[width][height]')]
      .filter((i) => i.naturalWidth > 0)
      .filter((i) => Math.abs((Number(i.getAttribute('width')) / Number(i.getAttribute('height'))) - (i.naturalWidth / i.naturalHeight)) > 0.02)
      .map((i) => `${new URL(i.currentSrc || i.src).pathname} declara ${i.getAttribute('width')}×${i.getAttribute('height')} y mide ${i.naturalWidth}×${i.naturalHeight}`))
  if (!misdeclared.length) ok(`${vp.name} · los width/height declarados coinciden con las imágenes`)
  else bad(`${vp.name} · proporción mal declarada: ${misdeclared.join(' | ')}`)

  if (!errors.length) ok(`${vp.name} · cero errores de consola`)
  else bad(`${vp.name} · ${errors.length} errores de consola: ${errors.slice(0, 3).join(' | ')}`)

  if (!notFound.length) ok(`${vp.name} · cero respuestas 404`)
  else bad(`${vp.name} · ${notFound.length} recursos 404: ${notFound.slice(0, 4).join(' | ')}`)

  await context.close()
}

// ── D · reduce-motion ───────────────────────────────────────────────────
async function runReducedMotion(browser) {
  head('prefers-reduced-motion: reduce')
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
  })
  const page = await context.newPage()
  let frames = 0
  page.on('response', (res) => { if (res.url().includes('/frames/')) frames++ })

  await page.goto(URL, { waitUntil: 'load' })
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(2500)

  const states = await page.evaluate(() => window.__seq())
  const animated = states.filter((s) => !s.static)
  const placeholders = states.filter((s) => s.placeholder)
  if (placeholders.length) warn(`${placeholders.length} secuencia(s) con material provisional: ${placeholders.map((s) => s.name).join(', ')}`)
  if (!animated.length) ok(`las ${states.length} secuencias pasan a estática`)
  else bad(`${animated.length} secuencias siguen animadas: ${animated.map((s) => s.name).join(', ')}`)

  if (frames === 0) ok('cero fotogramas descargados')
  else bad(`${frames} fotogramas descargados pese a reduce-motion`)

  const stills = await page.evaluate(() =>
    [...document.querySelectorAll('.seq__still')]
      .map((i) => getComputedStyle(i).display).filter((d) => d === 'none').length)
  if (stills === 0) ok('las imágenes de respaldo se muestran')
  else bad(`${stills} imágenes de respaldo siguen ocultas`)

  await context.close()
}

// ── Main ────────────────────────────────────────────────────────────────
const server = await startPreview()
const browser = await chromium.launch()
try {
  for (const vp of VIEWPORTS) await runViewport(browser, vp)
  await runReducedMotion(browser)
} finally {
  await browser.close()
  server?.kill()
}

console.log()
if (provisional) {
  console.log(`\x1b[33m⚠︎ ${provisional} aviso(s) de material provisional\x1b[0m: la web se revisa con las fotos de referencia.`)
  console.log('  Genera los clips (assets/source/PROMPTS.md) y lanza `pnpm frames`; entonces se verifica la animación.')
}
if (failures) {
  console.log(`\x1b[31m✗ ${failures} comprobación(es) fallida(s)\x1b[0m`)
  console.log('  Falta Lighthouse: ejecútalo DOS veces en móvil y escritorio.')
  process.exit(1)
}
console.log('\x1b[32m✓ todas las comprobaciones pasan\x1b[0m')
console.log('  Falta Lighthouse: ejecútalo DOS veces en móvil y escritorio.')
console.log('  Si una pasada da mucho menos que la otra, es un pico de TBT, no varianza.')
