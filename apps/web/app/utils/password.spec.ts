import { PASSWORD_MIN_LENGTH } from '@alconst/shared'
import { describe, expect, it } from 'vitest'
import { generateTemporaryPassword, newPasswordSchema } from './password'

describe('generateTemporaryPassword', () => {
  it('respectă politica de parole și nu conține caractere ambigue', () => {
    for (let i = 0; i < 50; i++) {
      const password = generateTemporaryPassword()
      expect(password.length).toBeGreaterThanOrEqual(PASSWORD_MIN_LENGTH)
      expect(password).toMatch(/^[a-km-zA-HJ-NP-Z2-9]+$/)
      expect(newPasswordSchema.safeParse(password).success).toBe(true)
    }
  })

  it('generează valori diferite la fiecare apel', () => {
    const values = new Set(Array.from({ length: 100 }, () => generateTemporaryPassword()))
    expect(values.size).toBe(100)
  })
})

describe('newPasswordSchema', () => {
  it('respinge parolele prea scurte, cu mesaj în română', () => {
    const result = newPasswordSchema.safeParse('scurta')
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toContain('cel puțin')
  })
})
