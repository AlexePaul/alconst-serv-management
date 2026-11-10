/** Convertește `YYYY-MM-DD` într-un `Date` la miezul nopții UTC (pentru coloanele de tip DATE). */
export function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Data de azi (UTC), fără oră – comparabilă cu valorile din coloanele DATE. */
export function todayDateOnly(): Date {
  return parseDateOnly(formatDateOnly(new Date()));
}
