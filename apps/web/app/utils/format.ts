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
