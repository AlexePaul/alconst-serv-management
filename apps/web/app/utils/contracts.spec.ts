import { describe, expect, it } from 'vitest'
import { contractExpiryWarning, CUSTOM_FREQUENCY, endDateWhenEnding, frequencyPresetFor } from './contracts'

describe('frequencyPresetFor', () => {
  it('recunoaște frecvențele uzuale', () => {
    expect(frequencyPresetFor('MONTH', 1)).toBe('MONTH:1')
    expect(frequencyPresetFor('MONTH', 3)).toBe('MONTH:3')
    expect(frequencyPresetFor('VISIT', 7)).toBe('VISIT:1')
  })

  it('întoarce „custom” pentru intervale neobișnuite', () => {
    expect(frequencyPresetFor('WEEK', 2)).toBe(CUSTOM_FREQUENCY)
    expect(frequencyPresetFor('MONTH', 4)).toBe(CUSTOM_FREQUENCY)
  })
})

describe('contractExpiryWarning', () => {
  const now = new Date(2026, 10, 10)

  it('semnalează contractele active expirate sau care expiră în 30 de zile', () => {
    expect(contractExpiryWarning({ status: 'ACTIVE', endDate: '2026-11-01' }, now)).toEqual({ label: 'Expirat', color: 'error' })
    expect(contractExpiryWarning({ status: 'ACTIVE', endDate: '2026-11-10' }, now)?.label).toBe('Expiră azi')
    expect(contractExpiryWarning({ status: 'ACTIVE', endDate: '2026-11-25' }, now)?.label).toBe('Expiră în 15 zile')
  })

  it('nu avertizează pentru contracte îndepărtate, nedeterminate sau încheiate', () => {
    expect(contractExpiryWarning({ status: 'ACTIVE', endDate: '2027-06-01' }, now)).toBeNull()
    expect(contractExpiryWarning({ status: 'ACTIVE', endDate: null }, now)).toBeNull()
    expect(contractExpiryWarning({ status: 'ENDED', endDate: '2026-11-01' }, now)).toBeNull()
  })
})

describe('endDateWhenEnding', () => {
  const today = '2026-11-10'

  it('încheie azi un contract în derulare, chiar dacă avea o dată de sfârșit viitoare', () => {
    expect(endDateWhenEnding({ startDate: '2026-01-01', endDate: null }, today)).toBe(today)
    expect(endDateWhenEnding({ startDate: '2026-01-01', endDate: '2027-01-01' }, today)).toBe(today)
  })

  it('păstrează data unui contract deja expirat', () => {
    expect(endDateWhenEnding({ startDate: '2025-01-01', endDate: '2026-06-30' }, today)).toBe('2026-06-30')
  })

  it('nu pune o dată de sfârșit înaintea începerii pentru un contract care nu a început', () => {
    expect(endDateWhenEnding({ startDate: '2027-01-01', endDate: null }, today)).toBeNull()
    expect(endDateWhenEnding({ startDate: '2027-01-01', endDate: '2027-12-31' }, today)).toBe('2027-12-31')
  })
})
