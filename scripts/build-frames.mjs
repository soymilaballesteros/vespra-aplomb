#!/usr/bin/env node
/**
 * build-frames.mjs — vídeo → secuencia de frames WebP para <canvas> scroll-driven.
 *
 *   node scripts/build-frames.mjs --input assets/source/x.mp4 --name rotate --frames 100
 *   node scripts/build-frames.mjs --all
 *
 * ffmpeg de este equipo NO trae encoder WebP, así que el pipeline es:
 *   ffmpeg -> PNG (ya escalado/recortado) -> cwebp -> WebP
 *
 * Cada secuencia se genera en dos juegos:
 *   desktop  escala a 1440 px de ancho
 *   mobile   recorta el centro a 3:4 y escala a 720 px (mejor encuadre vertical
 *            y bastantes menos bytes que escalar el 16:9 entero)
 *
 * Si un juego se pasa de presupuesto, baja la calidad y, si hace falta, el ancho,
 * reintentando automáticamente. Solo falla si ni el suelo cumple.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, rm, readdir, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const run = promisify(execFile)
const ROOT = path.resolve(import.meta.dirname, '..')
const TMP = path.join(ROOT, '.tmp-frames')
const OUT_ROOT = path.join(ROOT, 'public', 'frames')
const MANIFEST = path.join(ROOT, 'src', 'frames.manifest.json')

/** Secuencias del proyecto. `pnpm frames` construye estas dos. */
const SEQUENCES = [
  // 160 y no 100: el giro completo son 360°, así que con 100 fotogramas el salto
  // entre uno y otro es de 3,6° y el ojo lo lee como escalón. Con 160 baja a 2,25°.
  { name: 'rotate', input: 'assets/source/product-rotate.mp4', frames: 160 },
  { name: 'explode', input: 'assets/source/product-explode.mp4', frames: 120 },
]

/**
 * Presupuesto DURO por secuencia y juego.
 *
 * Es generoso a propósito. Los fotogramas NO participan de la carga inicial —
 * `scroll-sequence.ts` no pide ninguno hasta después de `load`, y `pnpm verify`
 * lo comprueba— así que estos megas no tocan el LCP ni la nota de Lighthouse.
 * Con el presupuesto anterior (5 MB) el build acababa bajando a q72 y 1440 px,
 * y sobre una pantalla Retina eso es ampliar el producto ×2 y perder el grano
 * de la piel, que es justo lo que hace que se lea como caro.
 */
const BUDGET = {
  desktop: { bytes: 9 * 1024 * 1024, perFrameTargetKB: 55, widths: [1920, 1600, 1440] },
  mobile: { bytes: 3 * 1024 * 1024, perFrameTargetKB: 22, widths: [960, 828, 720] },
}
const QUALITIES = [82, 76, 70, 64, 58]

const KB = (b) => (b / 1024).toFixed(1)
const MB = (b) => (b / 1024 / 1024).toFixed(2)

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--all') out.all = true
    else if (a.startsWith('--')) out[a.slice(2)] = argv[++i]
  }
  return out
}

async function probe(file) {
  const { stdout } = await run('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,nb_frames,avg_frame_rate:format=duration',
    '-of', 'json', file,
  ])
  const j = JSON.parse(stdout)
  const s = j.streams[0]
  const [num, den] = (s.avg_frame_rate || '0/1').split('/').map(Number)
  return {
    width: s.width,
    height: s.height,
    fps: den ? num / den : 0,
    duration: parseFloat(j.format.duration),
  }
}


/** Mediana de un array de números. */
function median(xs) {
  if (!xs.length) return 0
  const a = [...xs].sort((x, y) => x - y)
  const m = a.length >> 1
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2
}

/**
 * Mide la caja que ocupa el producto a lo largo de TODO el clip.
 *
 * Busca el producto por CONTRASTE contra el fondo, no por brillo. La versión
 * anterior asumía producto claro sobre fondo oscuro y se rompía entera con la
 * dirección de arte correcta para un salón —charol negro sobre gris perla—,
 * que es exactamente lo contrario. Ahora funciona en los dos sentidos.
 *
 * El fondo de estudio casi nunca es plano: tiene una caída vertical. Por eso el
 * nivel de fondo se estima por FILA, interpolando entre la banda de arriba (que
 * siempre es fondo) y los márgenes laterales de abajo. Sobre esa referencia,
 * un píxel es producto si se separa más de UMBRAL.
 */
async function measureSubject(input) {
  const W = 192, H = 108, UMBRAL = 42
  const { stdout } = await run('ffmpeg',
    ['-hide_banner', '-loglevel', 'error', '-i', input,
     '-vf', `scale=${W}:${H},format=gray`, '-f', 'rawvideo', '-'],
    { encoding: 'buffer', maxBuffer: 1 << 30 })
  const buf = stdout
  const frames = Math.floor(buf.length / (W * H))
  if (!frames) throw new Error(`ffmpeg no devolvió ningún fotograma de ${input}`)

  // Referencia de fondo del PRIMER fotograma: la banda superior entera y los
  // márgenes laterales de la banda inferior. Medianas, para que unos cuantos
  // píxeles de producto colados no muevan la referencia.
  const at = (f, x, y) => buf[f * W * H + y * W + x]
  const topSamples = []
  for (let y = 0; y < 8; y++) for (let x = 0; x < W; x++) topSamples.push(at(0, x, y))
  const bottomSamples = []
  const margin = Math.round(W * 0.06)
  for (let y = H - 8; y < H; y++) {
    for (let x = 0; x < margin; x++) bottomSamples.push(at(0, x, y))
    for (let x = W - margin; x < W; x++) bottomSamples.push(at(0, x, y))
  }
  const bgTop = median(topSamples)
  const bgBottom = median(bottomSamples)
  const bgAt = (y) => bgTop + (bgBottom - bgTop) * (y / (H - 1))

  const colHit = new Array(W).fill(false)
  const rowHit = new Array(H).fill(false)
  for (let f = 0; f < frames; f++) {
    for (let y = 0; y < H; y++) {
      const bg = bgAt(y)
      for (let x = 0; x < W; x++) {
        if (Math.abs(at(f, x, y) - bg) > UMBRAL) { colHit[x] = true; rowHit[y] = true }
      }
    }
  }

  const first = (a) => { const i = a.indexOf(true); return i < 0 ? 0 : i }
  const last = (a) => { const i = a.lastIndexOf(true); return i < 0 ? a.length - 1 : i }
  const box = {
    x0: first(colHit) / W, x1: last(colHit) / W,
    y0: first(rowHit) / H, y1: last(rowHit) / H,
  }
  if (box.x1 - box.x0 < 0.05 || box.y1 - box.y0 < 0.05) {
    throw new Error(
      `[${input}] no se distingue el producto del fondo (fondo ${Math.round(bgTop)}→` +
      `${Math.round(bgBottom)}, umbral ${UMBRAL}). ¿Es el producto casi del mismo tono ` +
      `que el set? Necesita separarse: luz de contorno, o un fondo de otro valor.`
    )
  }
  return box
}

/**
 * Color real del fondo del set, en hexadecimal.
 *
 * Lo usa el runtime para rellenar el lienzo alrededor del fotograma y para
 * fundir sus cantos: con un valor escrito a mano en el CSS, cualquier cambio de
 * set deja una costura visible donde termina la imagen.
 */
async function measureBackground(input) {
  const W = 48, H = 27
  const { stdout } = await run('ffmpeg',
    ['-hide_banner', '-loglevel', 'error', '-i', input,
     '-vf', `scale=${W}:${H},format=rgb24`, '-frames:v', '1', '-f', 'rawvideo', '-'],
    { encoding: 'buffer', maxBuffer: 1 << 24 })
  const rows = 4
  const ch = [[], [], []]
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 3
      for (let c = 0; c < 3; c++) ch[c].push(stdout[o + c])
    }
  }
  return '#' + ch.map((c) => Math.round(median(c)).toString(16).padStart(2, '0')).join('')
}

/**
 * Proporciones candidatas por juego, de más cerrada a más abierta.
 * Escritorio tira a apaisado (es un escenario a sangre); móvil admite cuadrado.
 */
const RATIOS = {
  desktop: [4 / 3, 3 / 2, 16 / 9],
  mobile: [1, 5 / 4, 4 / 3, 3 / 2, 16 / 9],
}
const SUBJECT_MARGIN = 0.07

/**
 * Elige el recorte MÁS CERRADO que contenga el producto con margen, centrado
 * sobre EL PRODUCTO y sin salirse de la imagen.
 *
 * Recorta en los dos ejes, no solo en horizontal. Con recorte solo horizontal,
 * un zapato que ocupa el 63% del ancho y el 45% del alto deja más de un tercio
 * de cada fotograma en fondo vacío: son píxeles pagados y guardados que luego
 * el lienzo tiene que ampliar. Cerrando el encuadre al ~85% se gana resolución
 * efectiva sobre el producto sin subir un solo kilobyte.
 */
function pickCrop(subject, srcW, srcH, ratios) {
  const sx0 = subject.x0 * srcW, sx1 = subject.x1 * srcW
  const sy0 = subject.y0 * srcH, sy1 = subject.y1 * srcH
  const needW = (sx1 - sx0) * (1 + SUBJECT_MARGIN * 2)
  const needH = (sy1 - sy0) * (1 + SUBJECT_MARGIN * 2)
  const midX = (sx0 + sx1) / 2
  const midY = (sy0 + sy1) / 2

  let best = null
  for (const ratio of ratios) {
    // Recorte mínimo con esa proporción que contiene el producto con margen.
    let cw = Math.max(needW, needH * ratio)
    let ch = cw / ratio
    if (cw > srcW || ch > srcH) continue
    cw = Math.round(cw / 2) * 2
    ch = Math.round(ch / 2) * 2
    const x = Math.max(0, Math.min(srcW - cw, Math.round(midX - cw / 2)))
    const y = Math.max(0, Math.min(srcH - ch, Math.round(midY - ch / 2)))
    const area = cw * ch
    if (!best || area < best.area) best = { width: cw, height: ch, x, y, ratio, area }
  }
  if (best) {
    best.label = `${best.width}x${best.height}`
    best.fill = (sx1 - sx0) / best.width
    return best
  }
  return { label: 'completo', width: srcW, height: srcH, x: 0, y: 0, ratio: srcW / srcH, fill: (sx1 - sx0) / srcW }
}

/** Filtro de vídeo por juego. */
function videoFilter(width, crop) {
  return crop
    ? `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},scale=${width}:-2:flags=lanczos`
    : `scale=${width}:-2:flags=lanczos`
}

/** Extrae exactamente `count` PNG repartidos de forma uniforme por todo el clip. */
async function extractPngs(input, dir, { width, count, duration, crop }) {
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })
  const fps = count / duration
  await run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error',
    '-i', input,
    '-vf', `${videoFilter(width, crop)},fps=${fps.toFixed(6)}`,
    '-frames:v', String(count),
    '-vsync', '0',
    path.join(dir, 'f-%05d.png'),
  ])
  const files = (await readdir(dir)).filter((f) => f.endsWith('.png')).sort()
  if (!files.length) throw new Error(`ffmpeg no extrajo ningún frame de ${input}`)
  return files.map((f) => path.join(dir, f))
}

/** cwebp en paralelo, un proceso por core (menos 1). */
async function encodeWebp(pngs, outDir, quality) {
  await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })
  const limit = Math.max(2, os.cpus().length - 1)
  let next = 0
  let total = 0
  let max = 0

  async function worker() {
    while (next < pngs.length) {
      const i = next++
      const out = path.join(outDir, `frame-${String(i + 1).padStart(4, '0')}.webp`)
      await run('cwebp', ['-quiet', '-q', String(quality), '-m', '6', '-sharp_yuv', pngs[i], '-o', out])
      const { size } = await stat(out)
      total += size
      if (size > max) max = size
    }
  }
  await Promise.all(Array.from({ length: limit }, worker))
  return { total, max, count: pngs.length }
}


/**
 * Stills derivados del mismo clip: póster del hero (LCP), imágenes de
 * respaldo para reduce-motion y los tres retratos del atelier.
 * Salen del vídeo para que TODA la página muestre exactamente la misma pieza.
 */
const IMG_DIR = path.join(ROOT, 'public', 'img')

/** Un frame del vídeo -> WebP recortado y escalado. */
async function still(input, { at, crop, width, height, quality, out }) {
  await mkdir(IMG_DIR, { recursive: true })
  const png = path.join(TMP, `still-${path.basename(out, '.webp')}.png`)
  await mkdir(TMP, { recursive: true })
  const seek = at > 0 ? ['-ss', at.toFixed(3)] : []
  await run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    ...seek, '-i', input,
    '-frames:v', '1',
    '-vf', `${crop},scale=${width}:${height}:flags=lanczos`,
    png,
  ])
  const dest = path.join(IMG_DIR, out)
  await run('cwebp', ['-quiet', '-q', String(quality), '-m', '6', '-sharp_yuv', png, '-o', dest])
  await rm(png, { force: true })
  const { size } = await stat(dest)
  console.log(`   still  ${out.padEnd(22)} ${width}x${height}  ${KB(size)} KB`)
  return size
}

/**
 * Imágenes de página: póster del hero y los tres retratos del atelier.
 * Salen de `assets/source/product-ref.png` (4K) si existe, porque tiene mucha
 * más resolución que un fotograma de vídeo; si no, del propio clip.
 * Los recortes se calculan sobre la caja medida del producto, nunca sobre el
 * centro del encuadre: la IA no centra el producto de forma fiable.
 */
const REF = path.join(ROOT, 'assets', 'source', 'product-ref.png')

/**
 * Tres macros del producto. `at`/`yAt` los sitúan sobre la pieza y `zoom` fija
 * el alto del recorte respecto al alto del producto. Las tres cosas varían a
 * propósito: con el mismo encuadre y la misma escala, puestas en fila parecen
 * una sola foto cortada en tiras.
 */
const CRAFT_SHOTS = [
  { out: 'craft-montado.webp',    at: 0.18, yAt: 0.45, zoom: 1.05, custom: 'atelier-montado' },
  { out: 'craft-cambrillon.webp', at: 0.52, yAt: 0.74, zoom: 0.62, custom: 'atelier-cambrillon' },
  { out: 'craft-forrado.webp',    at: 0.78, yAt: 0.38, zoom: 0.85, custom: 'atelier-forrado' },
]
const CRAFT_W = 720
const CRAFT_H = 900

function findCustom(name) {
  return ['png', 'jpg', 'jpeg', 'webp']
    .map((ext) => path.join(ROOT, 'assets', 'source', `${name}.${ext}`))
    .find((f) => existsSync(f))
}

/**
 * Póster del hero: primer fotograma de la rotación, con exactamente el mismo
 * recorte y las mismas dimensiones que cada juego. El lienzo lo redibuja con
 * su misma fórmula de encuadre, así que el relevo es invisible.
 */
async function emitHeroPoster(seq, crops, desktop, mobile) {
  const box = (c) => (c ? `crop=${c.width}:${c.height}:${c.x}:${c.y}` : 'crop=iw:ih')
  await still(seq.inputAbs, {
    at: 0.02, crop: box(crops.desktop), width: desktop.width, height: desktop.height,
    quality: 86, out: 'hero-poster.webp',
  })
  await still(seq.inputAbs, {
    at: 0.02, crop: box(crops.mobile), width: mobile.width, height: mobile.height,
    quality: 86, out: 'hero-poster-mobile.webp',
  })
}

async function emitPageImages() {
  if (!existsSync(REF)) {
    console.log('   (sin sneaker-ref.png: el póster y el atelier se derivan de los clips)')
    return null
  }
  const { stdout } = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', REF])
  const [w, h] = stdout.trim().split('x').map(Number)
  const subject = await measureSubject(REF)

  console.log(`\n▸ imágenes de página  ←  assets/source/product-ref.png (${w}x${h})`)
  console.log(
    `   producto en x ${Math.round(subject.x0 * w)}..${Math.round(subject.x1 * w)} ` +
    `(${Math.round((subject.x1 - subject.x0) * 100)}% del ancho)`
  )

  // Macros: recorte 4:5 centrado en un punto a lo largo de la pieza.
  const sx0 = subject.x0 * w
  const sx1 = subject.x1 * w
  const sy0 = subject.y0 * h
  const sy1 = subject.y1 * h
  for (const shot of CRAFT_SHOTS) {
    const source = findCustom(shot.custom)
    if (source) {
      await still(source, {
        at: 0, crop: 'crop=floor(ih*4/5/2)*2:ih',
        width: CRAFT_W, height: CRAFT_H, quality: 80, out: shot.out,
      })
      continue
    }
    const ch = Math.min(h, Math.round((sy1 - sy0) * shot.zoom))
    const cw = Math.min(w, Math.round((ch * CRAFT_W) / CRAFT_H))
    const cx = Math.max(0, Math.min(w - cw, Math.round(sx0 + (sx1 - sx0) * shot.at - cw / 2)))
    const cy = Math.max(0, Math.min(h - ch, Math.round(sy0 + (sy1 - sy0) * shot.yAt - ch / 2)))
    const upscale = CRAFT_H / ch
    if (upscale > 1.35) {
      console.log(`   ⚠︎ ${shot.out}: recorte ${cw}x${ch} escalaría x${upscale.toFixed(2)}; se verá blando.`)
    }
    await still(REF, {
      at: 0, crop: `crop=${cw}:${ch}:${cx}:${cy}`,
      width: CRAFT_W, height: CRAFT_H, quality: 74, out: shot.out,
    })
  }
  return { craft: { width: CRAFT_W, height: CRAFT_H } }
}

/** Imagen de respaldo de cada secuencia, para reduce-motion o fallo de carga. */
async function emitFallback(seq, meta, crop) {
  const at = seq.name === 'explode' ? Math.max(0, meta.duration - 0.3) : 0.05
  // Mismo recorte que el juego de escritorio, y la proporción sale de ahí: un
  // 1440x810 escrito a mano aplastaría cualquier encuadre que no fuese 16:9.
  const srcW = crop ? crop.width : meta.width
  const srcH = crop ? crop.height : meta.height
  const width = Math.min(1440, srcW)
  const height = Math.round((width * srcH) / srcW / 2) * 2
  await still(seq.inputAbs, {
    at,
    crop: crop ? `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}` : 'crop=iw:ih',
    width, height, quality: 78,
    out: `fallback-${seq.name}.webp`,
  })
}

/** Caja del producto trasladada a coordenadas del fotograma ya recortado. */
function subjectInFrame(subject, meta, crop) {
  if (!crop) return { x0: subject.x0, x1: subject.x1, y0: subject.y0, y1: subject.y1 }
  const px = (v) => (v * meta.width - crop.x) / crop.width
  const py = (v) => (v * meta.height - crop.y) / crop.height
  return {
    x0: Math.max(0, px(subject.x0)), x1: Math.min(1, px(subject.x1)),
    y0: Math.max(0, py(subject.y0)), y1: Math.min(1, py(subject.y1)),
  }
}

async function buildVariant(seq, variant, meta, crop, subject) {
  const budget = BUDGET[variant]
  const tmpDir = path.join(TMP, seq.name, variant)
  const outDir = path.join(OUT_ROOT, seq.name, variant)

  // Nunca escalar hacia arriba: pedir 1440 px a un clip de 1080 gasta bytes en
  // píxeles inventados y no aporta un solo detalle. El tope es el ancho REAL de
  // lo que va a entrar en ffmpeg — el del recorte si hay recorte, y si no el del clip.
  const srcW = crop ? crop.width : meta.width
  const widths = [...new Set(budget.widths.map((w) => Math.min(w, srcW)))]

  for (const width of widths) {
    const pngs = await extractPngs(seq.inputAbs, tmpDir, {
      width, count: seq.frames, duration: meta.duration, crop,
    })
    // Dimensiones reales del primer PNG (el filtro -2 redondea a par).
    const { stdout } = await run('ffprobe', [
      '-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', pngs[0],
    ])
    const [w, h] = stdout.trim().split('x').map(Number)

    for (const q of QUALITIES) {
      const res = await encodeWebp(pngs, outDir, q)
      const avg = res.total / res.count
      const ok = res.total <= budget.bytes
      console.log(
        `   ${variant.padEnd(7)} ${w}x${h}  q${q}  ${String(res.count).padStart(3)} frames  ` +
        `medio ${KB(avg).padStart(6)} KB  máx ${KB(res.max).padStart(6)} KB  ` +
        `total ${MB(res.total)} MB  ${ok ? '✓' : '✗ excede'}`
      )
      if (ok) {
        return {
          count: res.count, width: w, height: h, quality: q,
          bytes: res.total, avg, max: res.max,
          subject: subjectInFrame(subject, meta, crop),
        }
      }
    }
    console.log(`   ${variant}: ningún nivel de calidad cabe a ${width}px, bajo resolución…`)
  }
  await rm(tmpDir, { recursive: true, force: true })
  throw new Error(
    `[${seq.name}/${variant}] IMPOSIBLE cumplir el presupuesto de ${MB(budget.bytes)} MB ` +
    `ni con calidad ${QUALITIES.at(-1)} a ${widths.at(-1)}px.`
  )
}

async function buildSequence(seq) {
  seq.inputAbs = path.resolve(ROOT, seq.input)
  if (!existsSync(seq.inputAbs)) throw new Error(`No existe el vídeo de entrada: ${seq.input}`)

  const meta = await probe(seq.inputAbs)
  console.log(`\n▸ ${seq.name}  ←  ${seq.input}`)
  console.log(
    `   origen ${meta.width}x${meta.height} · ${meta.duration.toFixed(2)}s · ` +
    `${meta.fps.toFixed(2)} fps · objetivo ${seq.frames} frames`
  )

  const subject = await measureSubject(seq.inputAbs)
  const background = await measureBackground(seq.inputAbs)
  const crops = {
    desktop: pickCrop(subject, meta.width, meta.height, RATIOS.desktop),
    mobile: pickCrop(subject, meta.width, meta.height, RATIOS.mobile),
  }
  const fillIn = Math.round((subject.x1 - subject.x0) * 100)
  console.log(
    `   producto en x ${Math.round(subject.x0 * meta.width)}..${Math.round(subject.x1 * meta.width)} ` +
    `(${fillIn}% del ancho del origen) · fondo del set ${background}`
  )
  for (const [variant, c] of Object.entries(crops)) {
    console.log(
      `   recorte ${variant.padEnd(7)} ${c.label} desde ${c.x},${c.y} → ` +
      `el producto pasa a ocupar el ${Math.round(c.fill * 100)}% del ancho`
    )
  }
  // El encuadre es lo más barato que hay: cerrarlo sube la resolución efectiva
  // sobre el producto sin un solo byte más. Por debajo del 70% es que el clip
  // se generó con el zapato pequeño en cuadro.
  if (crops.desktop.fill < 0.7) {
    console.log(
      `   ⚠︎ el producto solo llena el ${Math.round(crops.desktop.fill * 100)}% del recorte de ` +
      `escritorio. Regenera el clip con el zapato al 85% del ancho: es resolución gratis.`
    )
  }

  await emitFallback(seq, meta, crops.desktop)
  const desktop = await buildVariant(seq, 'desktop', meta, crops.desktop, subject)
  const mobile = await buildVariant(seq, 'mobile', meta, crops.mobile, subject)
  if (seq.name === 'rotate') await emitHeroPoster(seq, crops, desktop, mobile)
  await rm(path.join(TMP, seq.name), { recursive: true, force: true })

  if (desktop.count !== mobile.count) {
    throw new Error(
      `[${seq.name}] desktop y mobile tienen distinto nº de frames ` +
      `(${desktop.count} vs ${mobile.count}); el runtime asume el mismo índice en ambos.`
    )
  }
  if (desktop.avg / 1024 > BUDGET.desktop.perFrameTargetKB) {
    console.log(
      `   ⚠︎ aviso: ${KB(desktop.avg)} KB/frame supera el objetivo de ` +
      `${BUDGET.desktop.perFrameTargetKB} KB (dentro del presupuesto total, pero apretado).`
    )
  }
  return { frames: desktop.count, background, desktop, mobile }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const list = args.all
    ? SEQUENCES
    : [{ name: args.name, input: args.input, frames: Number(args.frames) || 100 }]

  if (!args.all && (!args.name || !args.input)) {
    console.error('Uso: --input <vídeo> --name <secuencia> --frames <n>   |   --all')
    process.exit(1)
  }

  const manifest = existsSync(MANIFEST)
    ? JSON.parse(await run('cat', [MANIFEST]).then((r) => r.stdout))
    : {}

  const pageImages = await emitPageImages()
  for (const seq of list) manifest[seq.name] = await buildSequence(seq)
  if (pageImages) manifest.images = pageImages

  await mkdir(path.dirname(MANIFEST), { recursive: true })
  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
  await rm(TMP, { recursive: true, force: true })

  console.log('\n── Resumen ──')
  let grand = 0
  for (const [name, s] of Object.entries(manifest)) {
    if (!s.desktop) continue
    const t = s.desktop.bytes + s.mobile.bytes
    grand += t
    console.log(
      `  ${name.padEnd(8)} ${String(s.frames).padStart(3)} frames · ` +
      `desktop ${MB(s.desktop.bytes)} MB · mobile ${MB(s.mobile.bytes)} MB · total ${MB(t)} MB`
    )
  }
  console.log(`  ${''.padEnd(8)} TODO: ${MB(grand)} MB`)
  console.log(`\n✓ manifest → src/frames.manifest.json`)
}

main().catch((e) => {
  console.error(`\n✗ ${e.message}`)
  process.exit(1)
})
