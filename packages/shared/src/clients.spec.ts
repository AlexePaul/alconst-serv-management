import { describe, expect, it } from 'vitest';
import {
  CUI_PATTERN,
  formatFeeFrequency,
  monthlyEquivalent,
  monthlyEstimate,
  normalizeCui,
} from './clients.js';
import { normalizeSearch } from './search.js';

describe('tarife', () => {
  it('descrie frecvența în română', () => {
    expect(formatFeeFrequency('MONTH', 1)).toBe('lunar');
    expect(formatFeeFrequency('MONTH', 3)).toBe('la 3 luni');
    expect(formatFeeFrequency('WEEK', 1)).toBe('săptămânal');
    expect(formatFeeFrequency('WEEK', 2)).toBe('la 2 săptămâni');
    expect(formatFeeFrequency('YEAR', 1)).toBe('anual');
    expect(formatFeeFrequency('VISIT', 1)).toBe('la fiecare deplasare');
    expect(formatFeeFrequency('ONCE', 1)).toBe('o singură dată');
  });

  it('calculează echivalentul lunar al tarifelor recurente', () => {
    expect(monthlyEquivalent({ amount: 600, frequencyUnit: 'MONTH', frequencyInterval: 1 })).toBe(
      600,
    );
    expect(monthlyEquivalent({ amount: 900, frequencyUnit: 'MONTH', frequencyInterval: 3 })).toBe(
      300,
    );
    expect(monthlyEquivalent({ amount: 1200, frequencyUnit: 'YEAR', frequencyInterval: 1 })).toBe(
      100,
    );
    expect(
      monthlyEquivalent({ amount: 120, frequencyUnit: 'WEEK', frequencyInterval: 1 }),
    ).toBeCloseTo(520);
  });

  it('nu estimează tarifele care depind de deplasări sau sunt unice', () => {
    expect(
      monthlyEquivalent({ amount: 500, frequencyUnit: 'VISIT', frequencyInterval: 1 }),
    ).toBeNull();
    expect(
      monthlyEquivalent({ amount: 500, frequencyUnit: 'ONCE', frequencyInterval: 1 }),
    ).toBeNull();
  });

  it('însumează un contract cu tarif lunar și supliment trimestrial', () => {
    expect(
      monthlyEstimate([
        { amount: 400, frequencyUnit: 'MONTH', frequencyInterval: 1 },
        { amount: 300, frequencyUnit: 'MONTH', frequencyInterval: 3 },
        { amount: 250, frequencyUnit: 'VISIT', frequencyInterval: 1 },
      ]),
    ).toBe(500);
  });
});

describe('CUI', () => {
  it('normalizează și validează formatul', () => {
    expect(normalizeCui(' ro 123 456 ')).toBe('RO123456');
    expect(CUI_PATTERN.test('RO12345678')).toBe(true);
    expect(CUI_PATTERN.test('12345678')).toBe(true);
    expect(CUI_PATTERN.test('RO')).toBe(false);
    expect(CUI_PATTERN.test('12A45')).toBe(false);
  });
});

describe('normalizeSearch', () => {
  it('ignoră diacriticele, majusculele și spațiile multiple', () => {
    expect(normalizeSearch('  Ștefan   ȚĂRANU ')).toBe('stefan taranu');
    expect(normalizeSearch('SC Brâncuși & Fiii SRL')).toBe('sc brancusi & fiii srl');
  });
});
