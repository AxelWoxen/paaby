/* gruppering.js — dag-inndeling av arrangementslisten.
   Rene funksjoner: ingen DOM, ingen fetch, ingen side-effekter.

   Sortering skjer nå utenfor denne filen (se sortering.js).
   grupperEtterDag() forventer et allerede sortert array og bevarer
   rekkefølgen fra inndata — både for dager og for arrangementer innad. */

import { lagDagLabel }    from './formatering.js';
import { osloDataNokkel } from './oslo-tid.js';

/* Standard varighet når slutt mangler (4 timer i millisekunder). */
const STANDARD_VARIGHET_MS = 4 * 60 * 60 * 1000;

/**
 * Fjerner arrangementer som er ferdig (slutttidspunktet har passert).
 *
 * Regler:
 *   - Har arrangementet gyldig slutt → aktivt frem til sluttidspunktet.
 *   - Mangler slutt → antas å vare 4 timer etter start.
 *
 * @param {Array} eventer
 * @param {Date}  [nå]   - Valgfri "nå"-referanse (gjør funksjonen testbar).
 * @returns {Array}
 */
export function skjulPasserte(eventer, nå = new Date()) {
  return eventer.filter((e) => {
    const start = new Date(e.start);
    if (isNaN(start.getTime())) return false; /* ugyldig dato → skjul */

    let slutt;
    if (e.slutt) {
      const sluttDato = new Date(e.slutt);
      /* Ugyldig slutt → fall tilbake til standard varighet */
      slutt = isNaN(sluttDato.getTime()) ? new Date(start.getTime() + STANDARD_VARIGHET_MS) : sluttDato;
    } else {
      slutt = new Date(start.getTime() + STANDARD_VARIGHET_MS);
    }

    return slutt > nå;
  });
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
