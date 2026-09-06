/**
 * La colección: un solo zapato y tres pieles. Al señalar (o enfocar, o tocar)
 * una variante, la sección cambia `data-look` y el CSS viste la foto con el
 * filtro de esa piel. Sin JS se queda en la primera, que es la del hero.
 */
export function initCollection(): void {
  const section = document.getElementById('coleccion')
  if (!section) return
  const editions = Array.from(section.querySelectorAll<HTMLElement>('.edition[data-look]'))
  if (!editions.length) return
  const set = (look: string | undefined): void => {
    if (look && section.dataset.look !== look) section.dataset.look = look
  }
  for (const ed of editions) {
    ed.tabIndex = 0
    ed.addEventListener('pointerenter', () => set(ed.dataset.look))
    ed.addEventListener('focus', () => set(ed.dataset.look))
    ed.addEventListener('click', () => set(ed.dataset.look))
  }
}
