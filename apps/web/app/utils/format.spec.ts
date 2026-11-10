import { describe, expect, it } from 'vitest'
import { formatRelative, initials } from './format'

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
