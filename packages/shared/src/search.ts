/**
 * Normalizează un text pentru căutare: fără diacritice, cu litere mici, spații simple.
 * Folosit identic la indexare (server) și la interogare, astfel încât „stefan” să găsească „Ștefan”.
 */
export function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
