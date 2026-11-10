import { describe, expect, it } from 'vitest';
import { addDays, addMonths, diffDays, endOfMonth, hourIn, startOfWeek, todayIn } from './dates.js';
import { formatRecurrence, nextOccurrence, occurrencesBetween } from './tasks.js';

describe('date calendaristice', () => {
  it('adaugă zile peste granițele lunii și ale anului', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(diffDays('2026-11-10', '2026-11-20')).toBe(10);
    expect(diffDays('2026-11-10', '2026-11-01')).toBe(-9);
  });

  it('adaugă luni folosind ultima zi a lunilor mai scurte', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-01-31', 2)).toBe('2026-03-31');
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
    expect(addMonths('2026-03-15', -3)).toBe('2025-12-15');
  });

  it('calculează începutul săptămânii (luni) și sfârșitul lunii', () => {
    expect(startOfWeek('2026-11-10')).toBe('2026-11-09'); // marți → luni
    expect(startOfWeek('2026-11-15')).toBe('2026-11-09'); // duminică → luni
    expect(startOfWeek('2026-11-09')).toBe('2026-11-09');
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28');
  });

  it('determină ziua și ora în fusul orar al firmei', () => {
    // 22:30 UTC pe 10 noiembrie este deja 00:30 pe 11 noiembrie la București.
    const now = new Date('2026-11-10T22:30:00Z');
    expect(todayIn('Europe/Bucharest', now)).toBe('2026-11-11');
    expect(todayIn('UTC', now)).toBe('2026-11-10');
    expect(hourIn('Europe/Bucharest', now)).toBe(0);
  });
});

describe('recurență', () => {
  it('descrie frecvența în română', () => {
    expect(formatRecurrence('MONTH', 1)).toBe('lunar');
    expect(formatRecurrence('MONTH', 3)).toBe('la 3 luni');
    expect(formatRecurrence('WEEK', 1)).toBe('săptămânal');
    expect(formatRecurrence('DAY', 10)).toBe('la 10 zile');
    expect(formatRecurrence('YEAR', 1)).toBe('anual');
  });

  it('generează aparițiile lunare dintr-un interval', () => {
    expect(
      occurrencesBetween(
        { startDate: '2026-01-15', unit: 'MONTH', interval: 1 },
        '2026-11-10',
        '2027-01-20',
      ),
    ).toEqual(['2026-11-15', '2026-12-15', '2027-01-15']);
  });

  it('nu derivă la sfârșit de lună: 31 rămâne 31 acolo unde există', () => {
    expect(
      occurrencesBetween(
        { startDate: '2026-01-31', unit: 'MONTH', interval: 1 },
        '2026-02-01',
        '2026-05-31',
      ),
    ).toEqual(['2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
  });

  it('respectă intervalul: trimestrial și la două săptămâni', () => {
    expect(
      occurrencesBetween(
        { startDate: '2026-02-10', unit: 'MONTH', interval: 3 },
        '2026-01-01',
        '2026-12-31',
      ),
    ).toEqual(['2026-02-10', '2026-05-10', '2026-08-10', '2026-11-10']);
    expect(
      occurrencesBetween(
        { startDate: '2026-11-02', unit: 'WEEK', interval: 2 },
        '2026-11-10',
        '2026-12-15',
      ),
    ).toEqual(['2026-11-16', '2026-11-30', '2026-12-14']);
  });

  it('include capetele intervalului și respectă data de sfârșit', () => {
    const recurrence = {
      startDate: '2026-11-10',
      unit: 'WEEK' as const,
      interval: 1,
      endDate: '2026-11-24',
    };
    expect(occurrencesBetween(recurrence, '2026-11-10', '2026-12-31')).toEqual([
      '2026-11-10',
      '2026-11-17',
      '2026-11-24',
    ]);
    expect(occurrencesBetween(recurrence, '2026-11-25', '2026-12-31')).toEqual([]);
  });

  it('funcționează pentru recurențe începute cu mult timp în urmă', () => {
    expect(
      occurrencesBetween(
        { startDate: '2010-03-31', unit: 'MONTH', interval: 1 },
        '2026-11-01',
        '2026-12-31',
      ),
    ).toEqual(['2026-11-30', '2026-12-31']);
    expect(
      occurrencesBetween(
        { startDate: '2000-01-01', unit: 'DAY', interval: 7 },
        '2026-11-10',
        '2026-11-25',
      ),
    ).toHaveLength(2);
    expect(
      occurrencesBetween(
        { startDate: '2012-02-29', unit: 'YEAR', interval: 1 },
        '2026-01-01',
        '2028-12-31',
      ),
    ).toEqual(['2026-02-28', '2027-02-28', '2028-02-29']);
  });

  it('nu generează nimic înainte de data de început', () => {
    expect(
      occurrencesBetween(
        { startDate: '2027-01-01', unit: 'MONTH', interval: 1 },
        '2026-11-01',
        '2026-12-31',
      ),
    ).toEqual([]);
  });

  it('găsește următoarea apariție', () => {
    const quarterly = { startDate: '2026-02-10', unit: 'MONTH' as const, interval: 3 };
    expect(nextOccurrence(quarterly, '2026-11-10')).toBe('2026-11-10');
    expect(nextOccurrence(quarterly, '2026-11-11')).toBe('2027-02-10');
    expect(nextOccurrence(quarterly, '2025-01-01')).toBe('2026-02-10');
    expect(nextOccurrence({ ...quarterly, endDate: '2026-12-01' }, '2026-11-11')).toBeNull();
  });
});

describe('formatTimeRange', () => {
  it('afișează intervalul complet, doar începutul sau nimic', async () => {
    const { formatTimeRange, TIME_PATTERN } = await import('./tasks.js');
    expect(formatTimeRange('10:00', '12:30')).toBe('10:00–12:30');
    expect(formatTimeRange('10:00', null)).toBe('de la 10:00');
    expect(formatTimeRange(null, '12:00')).toBeNull();
    expect(TIME_PATTERN.test('09:05')).toBe(true);
    expect(TIME_PATTERN.test('24:00')).toBe(false);
    expect(TIME_PATTERN.test('9:5')).toBe(false);
  });
});
