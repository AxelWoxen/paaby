/* gruppering.js — dag-inndeling av arrangementslisten.
   Rene funksjoner: ingen DOM, ingen fetch, ingen side-effekter.

   Sortering skjer nå utenfor denne filen (se sortering.js).
   grupperEtterDag() forventer et allerede sortert array og bevarer
   rekkefølgen fra inndata — både for dager og for arrangementer innad. */

import { lagDagLabel }              from './formatering.js';
import { osloDataNokkel, eventTilstand } from './oslo-tid.js';

/**
 * Fjerner arrangementer som er helt ferdig — dvs. der kalenderdagen
 * eventet starter på (Oslo-tid, med 4-timers nattmargin inn i morgenen
 * etter) er over. Events som har startet, men fortsatt er "i dag" (jf.
 * nattmarginen), beholdes — de skal vises som utgått, ikke skjules
 * (se eventTilstand() i oslo-tid.js og kort-rendring i feed.js/forside.js).
 *
 * @param {Array} eventer
 * @param {Date}  [nå]   - Valgfri "nå"-referanse (gjør funksjonen testbar).
 * @returns {Array}
 */
export function skjulPasserte(eventer, nå = new Date()) {
  return eventer.filter((e) => eventTilstand(e.start, nå) !== 'ferdig');
}

/**
 * Grupperer et allerede sortert eventer-array etter kalenderdag i Oslo-tid.
 * Rekkefølgen på dagene og arrangementene innad bevares fra inndata.
 *
 * Kalles etter sorterEventer() — ikke sorter internt her.
 *
 * @param {Array} eventer - Filtrerte, sorterte arrangementer
 * @returns {Array}  [{ nokkel, label, eventer }, …] i inndata-rekkefølge
 */
export function grupperEtterDag(eventer) {
  const dagMap = new Map();

  for (const event of eventer) {
    const nokkel = osloDataNokkel(event.start);
    if (!dagMap.has(nokkel)) dagMap.set(nokkel, []);
    dagMap.get(nokkel).push(event);
  }

  /* Map bevarer innsettingsrekkefølge — dager og events er allerede i riktig rekkefølge */
  return [...dagMap.entries()].map(([nokkel, dagEventer]) => ({
    nokkel,
    label:   lagDagLabel(nokkel),
    eventer: dagEventer,
  }));
}
