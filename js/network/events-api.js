/* events-api.js — datahentingslaget.
   Importerer fra data/events.js (ES-modul) i stedet for fetch.
   Grensesnittet er det samme som før: hentEventer() returnerer et Promise. */

import { EVENTER } from '../../data/events.js';

/**
 * Returnerer alle eventer fra data/events.js.
 * Utleder en stabil id fra tittel + dato hvis eventet mangler en.
 * Den stabile id-en gjør at «lagre»-funksjonen virker selv uten eksplisitt id.
 *
 * @returns {Promise<Array>}
 */
export function hentEventer() {
  const eventer = EVENTER.map((e) => ({
    ...e,
    id: e.id ?? lagId(e.tittel, e.start),
  }));

  return Promise.resolve(eventer);
}

/**
 * Lager en stabil, URL-vennlig id fra tittel og startdato.
 * Eksempel: "Blå Jazzkvelder" + "2026-06-22T20:00" → "bla-jazzkvelder-2026-06-22"
 */
function lagId(tittel, start) {
  const slug = tittel
    .toLowerCase()
    /* Normaliser til NFD og fjern kombinerende diakritika (ø → o, å → a osv.) */
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    /* Erstatt alt som ikke er bokstav/tall med bindestrek */
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return `${slug}-${start.slice(0, 10)}`;
}
