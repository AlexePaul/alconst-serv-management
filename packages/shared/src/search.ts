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

/**
 * Cuvintele unei căutări, normalizate. Fiecare trebuie să apară undeva, în orice ordine:
 * „fabrica sanatate” găsește „Fabrica de Sănătate Montaj SRL”, iar „stingatoare fabrica” găsește
 * activitatea „Verificare stingătoare” a clientului „Fabrica …”.
 */
export function searchWords(value: string | null | undefined, max = 8): string[] {
  if (!value) return [];
  return [...new Set(normalizeSearch(value).split(' ').filter(Boolean))].slice(0, max);
}
