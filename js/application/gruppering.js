/* gruppering.js — dag-inndeling og sorteringslogikk.
   Rene funksjoner: ingen DOM, ingen fetch, ingen side-effekter. */

import { lagDagLabel }   from './formatering.js';
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
 * Sorterer eventer innad i én dag.
 *   - Nærhetssortering aktiv + posisjon kjent → nærmest først
 *   - Ellers → tidligst start først
 */
function sorterInnenDag(eventer, posisjon, naerhet) {
  if (naerhet && posisjon) {
    return [...eventer].sort((a, b) => (a._avstand ?? Infinity) - (b._avstand ?? Infinity));
  }
  return [...eventer].sort((a, b) => new Date(a.start) - new Date(b.start));
}

/**
 * Grupperer eventer etter kalenderdag i Oslo-tid og sorterer dem.
 *
 * @param {Array}        eventer  - Filtrerte, ikke-passerte arrangementer
 * @param {Object|null}  posisjon - { lat, lng } eller null
 * @param {boolean}      naerhet  - Om nærhetssortering er aktiv
 * @returns {Array}  [{ nokkel, label, eventer }, …] sortert kronologisk
 */
export function grupperEtterDag(eventer, posisjon, naerhet) {
  const dagMap = new Map();

  for (const event of eventer) {
    /* Hent Oslo-lokal YYYY-MM-DD fra ISO-strengen (forutsetter Oslo-offset) */
    const nokkel = osloDataNokkel(event.start);
    if (!dagMap.has(nokkel)) dagMap.set(nokkel, []);
    dagMap.get(nokkel).push(event);
  }

  return [...dagMap.keys()]
    .sort()
    .map((nokkel) => ({
      nokkel,
      label:   lagDagLabel(nokkel),
      eventer: sorterInnenDag(dagMap.get(nokkel), posisjon, naerhet),
    }));
}
