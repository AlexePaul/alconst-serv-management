import { describe, expect, it } from 'vitest'
import { countLabel, daysUntil, formatMoney, formatRelative, initials } from './format'

describe('formatRelative', () => {
  const now = new Date('2026-11-10T12:00:00Z')

  it('afișează „chiar acum” pentru mai puțin de un minut', () => {
    expect(formatRelative('2026-11-10T11:59:30Z', now)).toBe('chiar acum')
  })

  it('folosește unitatea potrivită, în română', () => {
    expect(formatRelative('2026-11-10T11:55:00Z', now)).toBe('acum 5 minute')
    expect(formatRelative('2026-11-10T09:00:00Z', now)).toBe('acum 3 ore')
    expect(formatRelative('2026-11-09T12:00:00Z', now)).toBe('ieri')
    expect(formatRelative('2026-11-07T12:00:00Z', now)).toBe('acum 3 zile')
  })
})

describe('initials', () => {
  it('întoarce inițialele cu majuscule', () => {
    expect(initials('ana', 'popescu')).toBe('AP')
  })
})

describe('formatMoney', () => {
  it('folosește separatorii românești și omite zecimalele inutile', () => {
    expect(formatMoney(1250.5)).toBe('1.250,5 lei')
    expect(formatMoney(400)).toBe('400 lei')
  })
})

describe('daysUntil', () => {
  it('numără zilele calendaristice, indiferent de oră', () => {
    const now = new Date(2026, 10, 10, 23, 30)
    expect(daysUntil('2026-11-10', now)).toBe(0)
    expect(daysUntil('2026-11-20', now)).toBe(10)
    expect(daysUntil('2026-11-01', now)).toBe(-9)
  })
})

describe('countLabel', () => {
  it('aplică regula „de” pentru numere de la 20 în sus', () => {
    expect(countLabel(0, 'angajat', 'angajați')).toBe('0 angajați')
    expect(countLabel(1, 'angajat', 'angajați')).toBe('1 angajat')
    expect(countLabel(19, 'angajat', 'angajați')).toBe('19 angajați')
    expect(countLabel(20, 'angajat', 'angajați')).toBe('20 de angajați')
    expect(countLabel(101, 'angajat', 'angajați')).toBe('101 angajați')
    expect(countLabel(125, 'angajat', 'angajați')).toBe('125 de angajați')
  })
})
