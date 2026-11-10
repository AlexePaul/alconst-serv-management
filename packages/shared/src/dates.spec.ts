import { describe, expect, it } from 'vitest';
import { addDays, addMonths, diffDays, hourIn, todayIn } from './dates.js';
import { occurrencesBetween } from './tasks.js';

/**
 * Schimbarea orei în România (Europe/Bucharest):
 *  - 29 martie 2026, 03:00 → 04:00 (ziua are 23 de ore);
 *  - 25 octombrie 2026, 04:00 → 03:00 (ziua are 25 de ore).
 * Termenele sunt date calendaristice, fără oră, deci nu au voie să se deplaseze, să lipsească
 * sau să se dubleze în jurul acestor zile.
 */
describe('schimbarea orei de vară și de iarnă', () => {
  const TZ = 'Europe/Bucharest';
  const at = (iso: string) => new Date(iso);

  it('stabilește corect ziua în jurul trecerii la ora de vară', () => {
    // UTC+2 până la 01:00 UTC, apoi UTC+3.
    expect(todayIn(TZ, at('2026-03-28T21:59:59Z'))).toBe('2026-03-28'); // 23:59 sâmbătă
    expect(todayIn(TZ, at('2026-03-28T22:00:00Z'))).toBe('2026-03-29'); // 00:00 duminică
    expect(todayIn(TZ, at('2026-03-29T00:59:59Z'))).toBe('2026-03-29'); // 02:59, înainte de salt
    expect(todayIn(TZ, at('2026-03-29T01:00:00Z'))).toBe('2026-03-29'); // 04:00, după salt
    expect(todayIn(TZ, at('2026-03-29T20:59:59Z'))).toBe('2026-03-29'); // 23:59 duminică
    expect(todayIn(TZ, at('2026-03-29T21:00:00Z'))).toBe('2026-03-30'); // 00:00 luni
  });

  it('stabilește corect ziua în jurul trecerii la ora de iarnă', () => {
    // UTC+3 până la 01:00 UTC, apoi UTC+2.
    expect(todayIn(TZ, at('2026-10-24T20:59:59Z'))).toBe('2026-10-24'); // 23:59 sâmbătă
    expect(todayIn(TZ, at('2026-10-24T21:00:00Z'))).toBe('2026-10-25'); // 00:00 duminică
    expect(todayIn(TZ, at('2026-10-25T00:30:00Z'))).toBe('2026-10-25'); // 03:30, prima dată
    expect(todayIn(TZ, at('2026-10-25T01:30:00Z'))).toBe('2026-10-25'); // 03:30, a doua oară
    expect(todayIn(TZ, at('2026-10-25T21:59:59Z'))).toBe('2026-10-25'); // 23:59 duminică
    expect(todayIn(TZ, at('2026-10-25T22:00:00Z'))).toBe('2026-10-26'); // 00:00 luni
  });

  it('ora locală sare peste 03:00 primăvara și o repetă toamna', () => {
    expect(hourIn(TZ, at('2026-03-29T00:30:00Z'))).toBe(2);
    expect(hourIn(TZ, at('2026-03-29T01:30:00Z'))).toBe(4);
    expect(hourIn(TZ, at('2026-10-25T00:30:00Z'))).toBe(3);
    expect(hourIn(TZ, at('2026-10-25T01:30:00Z'))).toBe(3);
    expect(hourIn(TZ, at('2026-10-25T05:00:00Z'))).toBe(7);
  });

  it('fiecare zi calendaristică apare exact o dată, din oră în oră, în ambele weekenduri', () => {
    for (const [start, days] of [
      ['2026-03-27T22:00:00Z', ['2026-03-28', '2026-03-29', '2026-03-30']],
      ['2026-10-23T21:00:00Z', ['2026-10-24', '2026-10-25', '2026-10-26']],
    ] as const) {
      const seen: string[] = [];
      for (let hour = 0; hour < 72; hour++) {
        const day = todayIn(TZ, new Date(new Date(start).getTime() + hour * 3_600_000));
        if (seen.at(-1) !== day) seen.push(day);
      }
      expect(seen.slice(0, 3)).toEqual(days);
      expect(seen.length).toBeLessThanOrEqual(4);
    }
  });

  it('aritmetica pe zile nu pierde și nu dublează zilele cu 23 sau 25 de ore', () => {
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25');
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
    expect(diffDays('2026-03-28', '2026-03-30')).toBe(2);
    expect(diffDays('2026-10-24', '2026-10-26')).toBe(2);
    expect(addMonths('2026-02-28', 1)).toBe('2026-03-28');
    expect(addMonths('2026-09-25', 1)).toBe('2026-10-25');
  });

  it('o obligație zilnică are câte un termen pe zi peste ambele schimbări de oră', () => {
    for (const [from, to] of [
      ['2026-03-20', '2026-04-05'],
      ['2026-10-18', '2026-11-02'],
    ] as const) {
      const dates = occurrencesBetween(
        { startDate: '2026-01-01', unit: 'DAY', interval: 1 },
        from,
        to,
      );
      expect(dates).toHaveLength(diffDays(from, to) + 1);
      expect(new Set(dates).size).toBe(dates.length);
      dates.forEach((date, index) => expect(date).toBe(addDays(from, index)));
    }
  });

  it('obligațiile săptămânale și lunare își păstrează ziua peste schimbarea orei', () => {
    // Duminica, inclusiv în zilele în care se schimbă ora.
    expect(
      occurrencesBetween(
        { startDate: '2026-03-15', unit: 'WEEK', interval: 1 },
        '2026-03-20',
        '2026-04-06',
      ),
    ).toEqual(['2026-03-22', '2026-03-29', '2026-04-05']);
    expect(
      occurrencesBetween(
        { startDate: '2026-10-11', unit: 'WEEK', interval: 2 },
        '2026-10-12',
        '2026-11-10',
      ),
    ).toEqual(['2026-10-25', '2026-11-08']);
    // Lunar pe 29 și pe 25 – chiar zilele schimbării.
    expect(
      occurrencesBetween(
        { startDate: '2026-01-29', unit: 'MONTH', interval: 1 },
        '2026-03-01',
        '2026-04-30',
      ),
    ).toEqual(['2026-03-29', '2026-04-29']);
    expect(
      occurrencesBetween(
        { startDate: '2026-07-25', unit: 'MONTH', interval: 3 },
        '2026-10-01',
        '2026-11-30',
      ),
    ).toEqual(['2026-10-25']);
  });
});
