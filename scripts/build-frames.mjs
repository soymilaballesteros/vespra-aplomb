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
  { name: 'rotate', input: 'assets/source/product-rotate.mp4', frames: 100 },
  { name: 'explode', input: 'assets/source/product-explode.mp4', frames: 120 },
]

/** Presupuesto DURO por secuencia y juego. */
const BUDGET = {
  desktop: { bytes: 5 * 1024 * 1024, perFrameTargetKB: 35, widths: [1440, 1280, 1152] },
  mobile: { bytes: 2 * 1024 * 1024, perFrameTargetKB: 17, widths: [720, 640, 576] },
}
const QUALITIES = [72, 66, 60, 54, 48]

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


/**
 * Mide la caja que ocupa el producto a lo largo de TODO el clip.
 * Saca el vídeo en gris a baja resolución y busca, por columna y por fila,
 * el píxel más claro: el fondo de estudio ronda 4-30 y el producto pasa de 90.
 * Hace falta porque el recorte de móvil no puede asumir que la IA haya
 * centrado el producto — en el clip del despiece quedó desplazado 25 px.
 */
async function measureSubject(input) {
  const W = 192, H = 108, T = 70
  const { stdout } = await run('ffmpeg',
    ['-hide_banner', '-loglevel', 'error', '-i', input,
     '-vf', `scale=${W}:${H},format=gray`, '-f', 'rawvideo', '-'],
    { encoding: 'buffer', maxBuffer: 1 << 30 })
  const buf = stdout
  const frames = Math.floor(buf.length / (W * H))
  const colMax = new Array(W).fill(0)
  const rowMax = new Array(H).fill(0)
  for (let f = 0; f < frames; f++) {
    const off = f * W * H
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const v = buf[off + y * W + x]
        if (v > colMax[x]) colMax[x] = v
        if (v > rowMax[y]) rowMax[y] = v
      }
    }
  }
  const first = (a) => { const i = a.findIndex((v) => v >= T); return i < 0 ? 0 : i }
  const last = (a) => { const i = [...a].reverse().findIndex((v) => v >= T); return i < 0 ? a.length - 1 : a.length - 1 - i }
  return {
    x0: first(colMax) / W, x1: last(colMax) / W,
    y0: first(rowMax) / H, y1: last(rowMax) / H,
  }
}

/** Relaciones de aspecto candidatas para móvil, de la más cerrada a la más abierta. */
const MOBILE_RATIOS = [
  ['1:1', 1], ['5:4', 1.25], ['4:3', 4 / 3], ['3:2', 1.5], ['16:9', 16 / 9],
]
const SUBJECT_MARGIN = 0.06

/**
 * Elige el recorte vertical más cerrado que contenga el producto con margen,
 * centrado sobre EL PRODUCTO (no sobre el frame) y sin salirse de la imagen.
 */
function pickMobileCrop(subject, srcW, srcH) {
  const sx0 = subject.x0 * srcW
  const sx1 = subject.x1 * srcW
  const need = (sx1 - sx0) * (1 + SUBJECT_MARGIN * 2)
  const mid = (sx0 + sx1) / 2

  for (const [label, ratio] of MOBILE_RATIOS) {
    const cw = Math.min(srcW, Math.round(srcH * ratio))
    if (cw < need) continue
    let x = Math.round(mid - cw / 2)
    x = Math.max(0, Math.min(srcW - cw, x))
    if (x <= sx0 && x + cw >= sx1) {
      return { label, width: cw, height: srcH, x, ratio }
    }
  }
  return { label: 'completo', width: srcW, height: srcH, x: 0, ratio: srcW / srcH }
}

/** Filtro de vídeo por juego. */
function videoFilter(variant, width, crop) {
  return variant === 'mobile' && crop
    ? `crop=${crop.width}:${crop.height}:${crop.x}:0,scale=${width}:-2:flags=lanczos`
    : `scale=${width}:-2:flags=lanczos`
}

/** Extrae exactamente `count` PNG repartidos de forma uniforme por todo el clip. */
async function extractPngs(input, dir, { variant, width, count, duration, crop }) {
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })
  const fps = count / duration
  await run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error',
    '-i', input,
    '-vf', `${videoFilter(variant, width, crop)},fps=${fps.toFixed(6)}`,
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
async function emitHeroPoster(seq, meta, crop, desktop, mobile) {
  await still(seq.inputAbs, {
    at: 0.02, crop: 'crop=iw:ih', width: desktop.width, height: desktop.height,
    quality: 82, out: 'hero-poster.webp',
  })
  await still(seq.inputAbs, {
    at: 0.02, crop: `crop=${crop.width}:${crop.height}:${crop.x}:0`,
    width: mobile.width, height: mobile.height, quality: 82, out: 'hero-poster-mobile.webp',
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
  const crop = pickMobileCrop(subject, w, h)

  console.log(`\n▸ imágenes de página  ←  assets/source/product-ref.png (${w}x${h})`)
  console.log(
    `   producto en x ${Math.round(subject.x0 * w)}..${Math.round(subject.x1 * w)} ` +
    `· póster ${crop.label} desde x=${crop.x}`
  )

  // Dos anchos: en un móvil el póster se pinta a ~380 px CSS, así que servirle
  // 1200 px es tirar la mitad de los bytes del LCP.

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
async function emitFallback(seq, meta) {
  const at = seq.name === 'explode' ? Math.max(0, meta.duration - 0.3) : 0.05
  // La proporción sale del clip, no de un 16:9 escrito a mano: si algún día una
  // secuencia se genera en otro formato, un 1440x810 fijo la aplastaría.
  const width = Math.min(1440, meta.width)
  const height = Math.round((width * meta.height) / meta.width / 2) * 2
  await still(seq.inputAbs, {
    at, crop: 'crop=iw:ih', width, height, quality: 72,
    out: `fallback-${seq.name}.webp`,
  })
}

/** Caja del producto trasladada a coordenadas del fotograma ya recortado. */
function subjectInFrame(subject, meta, crop) {
  if (!crop) return { x0: subject.x0, x1: subject.x1, y0: subject.y0, y1: subject.y1 }
  const px0 = subject.x0 * meta.width
  const px1 = subject.x1 * meta.width
  return {
    x0: Math.max(0, (px0 - crop.x) / crop.width),
    x1: Math.min(1, (px1 - crop.x) / crop.width),
    y0: subject.y0,
    y1: subject.y1,
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
      variant, width, count: seq.frames, duration: meta.duration, crop,
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
  const crop = pickMobileCrop(subject, meta.width, meta.height)
  console.log(
    `   producto en x ${Math.round(subject.x0 * meta.width)}..${Math.round(subject.x1 * meta.width)} ` +
    `(${Math.round((subject.x1 - subject.x0) * 100)}% del ancho) · ` +
    `recorte móvil ${crop.label} → ${crop.width}x${crop.height} desde x=${crop.x}`
  )

  await emitFallback(seq, meta)
  const desktop = await buildVariant(seq, 'desktop', meta, null, subject)
  const mobile = await buildVariant(seq, 'mobile', meta, crop, subject)
  if (seq.name === 'rotate') await emitHeroPoster(seq, meta, crop, desktop, mobile)
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
  return { frames: desktop.count, desktop, mobile }
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
