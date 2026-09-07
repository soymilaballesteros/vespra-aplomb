/**
 * Enciende el hito que corresponde al progreso.
 *
 * Por defecto los hitos se reparten el recorrido a partes iguales. Si alguno
 * lleva `data-from` (fracción 0-1 en la que entra), manda eso: el hero lo usa
 * para que las notas laterales no aparezcan hasta que el texto se ha retirado.
 * Antes del primer `data-from` no hay ninguno encendido.
 *
 * Lo usan las secuencias de fotogramas (main.ts) y la cámara sobre fotos
 * (camera.ts): el texto no sabe qué hay detrás, solo a qué altura va.
 */
export function bindBeats(section: HTMLElement): (p: number) => void {
  const beats = Array.from(section.querySelectorAll<HTMLElement>('.beat'))
  if (!beats.length) return () => {}
  const timed = beats.some((b) => b.dataset.from !== undefined)
  const from = beats.map((b, n) => timed ? Number(b.dataset.from ?? 0) : n / beats.length)
  // `data-beats="accumulate"`: los hitos se quedan encendidos al pasar (las
  // notas del hero van apareciendo alrededor del zapato y no se van).
  const accumulate = section.querySelector<HTMLElement>('.beats')?.dataset.beats === 'accumulate'
  let active = -2
  return (p: number) => {
    let i = -1
    for (let n = 0; n < from.length; n++) if (p >= from[n]) i = n
    if (i === active) return
    active = i
    beats.forEach((b, n) => b.classList.toggle('is-on', accumulate ? n <= i : n === i))
  }
}
