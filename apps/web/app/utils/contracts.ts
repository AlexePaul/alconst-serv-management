import { todayIn } from '@alconst/shared'
import type { ContractDto, ContractStatus, FeeFrequencyUnit } from '@alconst/shared'
import { daysUntil } from './format'

/** Opțiunile de frecvență oferite în formular; „custom” deschide alegerea liberă a intervalului. */
export const FEE_FREQUENCY_PRESETS = [
  { value: 'WEEK:1', label: 'Săptămânal', unit: 'WEEK', interval: 1 },
  { value: 'MONTH:1', label: 'Lunar', unit: 'MONTH', interval: 1 },
  { value: 'MONTH:3', label: 'La 3 luni', unit: 'MONTH', interval: 3 },
  { value: 'MONTH:6', label: 'La 6 luni', unit: 'MONTH', interval: 6 },
  { value: 'YEAR:1', label: 'Anual', unit: 'YEAR', interval: 1 },
  { value: 'VISIT:1', label: 'La fiecare deplasare', unit: 'VISIT', interval: 1 },
  { value: 'ONCE:1', label: 'O singură dată', unit: 'ONCE', interval: 1 }
] as const satisfies { value: string, label: string, unit: FeeFrequencyUnit, interval: number }[]

export const CUSTOM_FREQUENCY = 'custom'

/** Găsește opțiunea predefinită pentru o frecvență sau „custom” dacă nu există una. */
export function frequencyPresetFor(unit: FeeFrequencyUnit, interval: number): string {
  const normalized = unit === 'VISIT' || unit === 'ONCE' ? 1 : interval
  return FEE_FREQUENCY_PRESETS.find(preset => preset.unit === unit && preset.interval === normalized)?.value
    ?? CUSTOM_FREQUENCY
}

export const CONTRACT_STATUS_COLORS: Record<ContractStatus, 'success' | 'neutral' | 'info'> = {
  ACTIVE: 'success',
  DRAFT: 'info',
  ENDED: 'neutral'
}

const EXPIRING_SOON_DAYS = 30

/** Avertizare pentru contractele active care au expirat sau expiră în curând. */
export function contractExpiryWarning(
  contract: Pick<ContractDto, 'status' | 'endDate'>,
  now: Date = new Date()
): { label: string, color: 'error' | 'warning' } | null {
  if (contract.status !== 'ACTIVE' || !contract.endDate) return null
  const days = daysUntil(contract.endDate, now)
  if (days < 0) return { label: 'Expirat', color: 'error' }
  if (days === 0) return { label: 'Expiră azi', color: 'warning' }
  if (days <= EXPIRING_SOON_DAYS) return { label: days === 1 ? 'Expiră mâine' : `Expiră în ${days} zile`, color: 'warning' }
  return null
}

/**
 * Data de sfârșit a unui contract care este încheiat astăzi (contractele nu se șterg, se încheie):
 *  - dacă a expirat deja, data existentă rămâne;
 *  - dacă este în derulare, se încheie azi, chiar dacă avea o dată de sfârșit viitoare;
 *  - dacă încă nu a început, data rămâne neschimbată (nu poate fi înaintea începerii).
 */
export function endDateWhenEnding(
  contract: Pick<ContractDto, 'startDate' | 'endDate'>,
  today: string = todayIn()
): string | null {
  if (contract.endDate && contract.endDate <= today) return contract.endDate
  return contract.startDate <= today ? today : contract.endDate
}
