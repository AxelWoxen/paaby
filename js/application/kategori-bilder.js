/* kategori-bilder.js — sentral sannhetskilde for standardbilder per kategori.
   Stier er relative til dokument-roten (index.html). */

export const KATEGORI_BILDER = Object.freeze({
  musikk: 'bilder/kategorier/musikk.jpg',
  mat:    'bilder/kategorier/mat.jpg',
  klubb:  'bilder/kategorier/klubb.jpg',
  pafunn: 'bilder/kategorier/pafunn.jpg',
});

const GENERELL_FALLBACK = 'bilder/kategorier/musikk.jpg';

/**
 * Returnerer bilde-URL for et event:
 *   1. event.bilde  — dersom satt og ikke tom streng
 *   2. Kategoriens standardbilde
 *   3. Generell fallback dersom kategori er ukjent
 *
 * @param {Object} event
 * @returns {string}
 */
export function hentEventbilde(event) {
  if (event.bilde && typeof event.bilde === 'string' && event.bilde.trim() !== '') {
    return event.bilde;
  }
  return KATEGORI_BILDER[event.kategori] ?? GENERELL_FALLBACK;
}
