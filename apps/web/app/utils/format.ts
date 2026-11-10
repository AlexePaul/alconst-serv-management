const LOCALE = 'ro-RO'

const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short' })
const longDateFormat = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const relativeFormat = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' })

/** Ex.: „10 nov. 2026, 14:32”. */
export function formatDateTime(value: string | Date): string {
  return dateTimeFormat.format(new Date(value))
}

/** Ex.: „marți, 10 noiembrie 2026”. */
export function formatLongDate(value: string | Date): string {
  return longDateFormat.format(new Date(value))
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60]
]

/** Ex.: „acum 5 minute”, „ieri”, „acum 3 zile”. */
export function formatRelative(value: string | Date, now: Date = new Date()): string {
  const seconds = Math.round((new Date(value).getTime() - now.getTime()) / 1000)
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) {
      return relativeFormat.format(Math.round(seconds / size), unit)
    }
  }
  return 'chiar acum'
}

/** Inițialele unei persoane, pentru avatar. */
export function initials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
}

const dateFormat = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium' })
const moneyFormat = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 0, maximumFractionDigits: 2 })

/** Formatează o dată calendaristică `YYYY-MM-DD` (fără oră). Ex.: „31 dec. 2026”. */
export function formatDate(value: string): string {
  return dateFormat.format(new Date(`${value}T00:00:00`))
}

/** Ex.: „1.250,5 lei”. */
export function formatMoney(amount: number): string {
  return `${moneyFormat.format(amount)} lei`
}

/** Numărul de zile dintre azi și o dată `YYYY-MM-DD` (negativ dacă a trecut). */
export function daysUntil(value: string, now: Date = new Date()): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const target = new Date(`${value}T00:00:00`).getTime()
  return Math.round((target - today) / (24 * 3600 * 1000))
}

/** Valoare afișabilă pentru câmpuri opționale. */
export function orDash(value: string | null | undefined): string {
  return value?.trim() ? value : '—'
}

/** Forma corectă a substantivului după numeral: 1 angajat, 2 angajați, 20 de angajați. */
export function countLabel(count: number, one: string, many: string): string {
  if (count === 1) return `1 ${one}`
  const lastTwo = count % 100
  return count === 0 || (lastTwo > 0 && lastTwo < 20) ? `${count} ${many}` : `${count} de ${many}`
}
