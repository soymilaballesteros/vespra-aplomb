#!/usr/bin/env node
/**
 * shots.mjs — una captura por sección, en escritorio (1440×900) y móvil (390×844),
 * contra el build de producción. Para la ronda de inspección visual.
 *
 *   pnpm build && node scripts/shots.mjs <carpeta de salida>
 */
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'
const OUT = process.argv[2] || "shots"
const ROOT = process.cwd()
const proc = spawn('npx', ['vite', 'preview', '--port', '4174'], { cwd: ROOT, stdio: 'ignore' })
const URL = 'http://localhost:4174'
for (let i = 0; i < 60; i++) { try { if ((await fetch(URL)).ok) break } catch {} await new Promise(r => setTimeout(r, 300)) }
const browser = await chromium.launch()
const IDS = ['hero','manifiesto','paso','plano','atelier','anatomia','detalle','ficha','casa','coleccion','cita']
for (const vp of [{ n: 'd', w: 1440, h: 900 }, { n: 'm', w: 390, h: 844 }]) {
  const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } })
  await page.goto(URL, { waitUntil: 'load' })
  await page.waitForTimeout(1500)
  // Barrido para disparar reveals y lazy
  await page.evaluate(async () => { const s = innerHeight * 0.7; for (let y = 0; y < document.documentElement.scrollHeight; y += s) { scrollTo({ top: y, behavior: 'instant' }); await new Promise(r => setTimeout(r, 90)) } })
  for (const id of IDS) {
    await page.evaluate((i) => { const el = document.getElementById(i); const top = el.getBoundingClientRect().top + scrollY; const extra = el.classList.contains('detail') ? innerHeight * 1.4 : 0; scrollTo({ top: top + extra, behavior: 'instant' }) }, id)
    await page.waitForTimeout(900)
    await page.screenshot({ path: `${OUT}/${vp.n}-${id}.png` })
  }
  // Un punto medio del detalle y del plano
  await page.close()
}
await browser.close(); proc.kill()
