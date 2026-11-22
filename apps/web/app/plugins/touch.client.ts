/**
 * Pe telefon și tabletă:
 *  - câmpurile și butoanele au implicit o mărime mai mare, ușor de atins cu degetul (pe calculator
 *    rămân compacte);
 *  - butonul „Înapoi” al telefonului sau al browserului închide întâi fereastra deschisă
 *    (formular, meniu), în loc să părăsească pagina și să piardă ce s-a completat.
 */
export default defineNuxtPlugin(() => {
  const touch = window.matchMedia('(pointer: coarse)').matches
  if (touch) {
    const large = { defaultVariants: { size: 'lg' as const } }
    updateAppConfig({
      ui: {
        button: large,
        input: large,
        select: large,
        selectMenu: large,
        textarea: large,
        inputMenu: large
      }
    })
  }

  // „Înapoi” cât timp o fereastră este deschisă: evenimentul este oprit înainte să ajungă la
  // router (ascultătorul în faza de captură rulează primul), adresa este readusă cu un pas înainte,
  // iar fereastra se închide ca la apăsarea tastei Esc.
  let restoring = false
  window.addEventListener('popstate', (event) => {
    if (restoring) {
      restoring = false
      event.stopImmediatePropagation()
      return
    }
    const layers = document.querySelectorAll<HTMLElement>('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"]')
    const top = layers[layers.length - 1]
    if (!top) return
    event.stopImmediatePropagation()
    restoring = true
    history.go(1)
    top.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  }, { capture: true })
})
