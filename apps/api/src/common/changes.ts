/**
 * Pentru actualizări parțiale (PATCH): întoarce doar câmpurile trimise efectiv (diferite de
 * `undefined`) a căror valoare diferă de cea existentă. `null` înseamnă „șterge valoarea”.
 */
export function definedChanges<T extends object>(
  input: T,
  existing: { [K in keyof T]?: unknown },
): Partial<T> {
  const changes: Partial<T> = {};
  for (const key of Object.keys(input) as (keyof T)[]) {
    const value = input[key];
    if (value === undefined) continue;
    const current = existing[key];
    const same =
      value instanceof Date && current instanceof Date
        ? value.getTime() === current.getTime()
        : value === current;
    if (!same) changes[key] = value;
  }
  return changes;
}
