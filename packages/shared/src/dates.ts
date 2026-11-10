/**
 * Utilitare pentru date calendaristice fără oră, în format `YYYY-MM-DD`.
 * Calculele se fac în UTC, deci nu depind de fusul orar al serverului sau al browserului.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function toUtc(date: string): number {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return Date.UTC(year, month - 1, day);
}

function fromUtc(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

/** Data de azi într-un fus orar dat (implicit cel al firmei). */
export function todayIn(timeZone = 'Europe/Bucharest', now: Date = new Date()): string {
  // Formatul „sv-SE” produce direct YYYY-MM-DD.
  return new Intl.DateTimeFormat('sv-SE', { timeZone, dateStyle: 'short' }).format(now);
}

/** Ora locală (0–23) într-un fus orar dat. */
export function hourIn(timeZone = 'Europe/Bucharest', now: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(now),
  );
}

export function addDays(date: string, days: number): string {
  return fromUtc(toUtc(date) + days * DAY_MS);
}

/** Numărul de zile de la `from` până la `to` (negativ dacă `to` este înainte). */
export function diffDays(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

/**
 * Adaugă luni păstrând ziua din lună; dacă luna rezultată este mai scurtă,
 * se folosește ultima ei zi (31 ianuarie + 1 lună = 28/29 februarie).
 */
export function addMonths(date: string, months: number): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const total = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(total / 12);
  const targetMonth = total % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return fromUtc(Date.UTC(targetYear, targetMonth, Math.min(day, lastDay)));
}

/** Luni (prima zi a săptămânii) pentru săptămâna care conține data. */
export function startOfWeek(date: string): string {
  const weekday = new Date(toUtc(date)).getUTCDay(); // 0 = duminică
  return addDays(date, -((weekday + 6) % 7));
}

export function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function endOfMonth(date: string): string {
  return addDays(addMonths(startOfMonth(date), 1), -1);
}
