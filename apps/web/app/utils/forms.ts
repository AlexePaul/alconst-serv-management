import { nextTick } from 'vue'

/**
 * După o validare eșuată, aduce în ecran primul câmp greșit (sau mesajul general de eroare) și
 * pune cursorul în el. Pe telefon, butonul de salvare este jos, iar câmpurile cu probleme sunt
 * adesea sus, în afara ecranului: fără asta, apăsarea pare să nu facă nimic.
 */
export function scrollToFirstError(): void {
  nextTick(() => {
    const target = document.querySelector<HTMLElement>('[aria-invalid="true"], [data-form-error]')
    if (!target) return
    target.scrollIntoView({ block: 'center', behavior: 'smooth' })
    if (target.matches('input, textarea, button, [tabindex]')) target.focus({ preventScroll: true })
  })
}
