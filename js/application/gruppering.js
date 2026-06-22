/* gruppering.js — dag-inndeling og sorteringslogikk.
   Rene funksjoner: ingen DOM, ingen fetch, ingen side-effekter. */

const UKEDAGER = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const MÅNEDER  = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];

/**
 * Lokal YYYY-MM-DD-nøkkel for et Date-objekt.
 * Bruker lokaltid (ikke UTC) slik at datoen stemmer for norske brukere.
 */
function lokalDatoNokkel(dato) {
  const year  = dato.getFullYear();
  const month = String(dato.getMonth() + 1).padStart(2, '0');
  const day   = String(dato.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Fjerner eventer der start-tidspunktet allerede har passert.
 *
 * @param {Array} eventer
 * @returns {Array}
 */
export function skjulPasserte(eventer) {
  const nå = new Date();
  return eventer.filter((e) => new Date(e.start) > nå);
}

/**
 * Bygger en leserbar overskrift for en dag.
 *   Dagens dato   → "I dag · mandag 22. juni"
 *   Andre datoer  → "Tirsdag 23. juni"
 *
 * @param {string} datoNokkel - "YYYY-MM-DD"
 * @returns {string}
 */
export function lagDagLabel(datoNokkel) {
  /* Konstruer datoobjekt i lokaltid ved å legge til T00:00:00 */
  const dato        = new Date(datoNokkel + 'T00:00:00');
  const iDagNokkel  = lokalDatoNokkel(new Date());
  const ukedag      = UKEDAGER[dato.getDay()];
  const dag         = dato.getDate();
  const måned       = MÅNEDER[dato.getMonth()];

  if (datoNokkel === iDagNokkel) {
    return `I dag · ${ukedag} ${dag}. ${måned}`;
  }

  /* Stor forbokstav på ukedagen */
  return `${ukedag.charAt(0).toUpperCase()}${ukedag.slice(1)} ${dag}. ${måned}`;
}

/**
 * Sorterer eventer innad i én dag.
 *   - Nærhetssortering aktiv + posisjon kjent → sorter på avstand (nærmest først)
 *   - Ellers → sorter på starttid (tidligst først)
 *
 * @param {Array}       eventer
 * @param {Object|null} posisjon - { lat, lng } eller null
 * @param {boolean}     naerhet  - Er nærhetssortering aktiv?
 * @returns {Array} ny, sortert liste (muterer ikke originalen)
 */
function sorterInnenDag(eventer, posisjon, naerhet) {
  if (naerhet && posisjon) {
    return [...eventer].sort((a, b) => (a._avstand ?? Infinity) - (b._avstand ?? Infinity));
  }
  return [...eventer].sort((a, b) => new Date(a.start) - new Date(b.start));
}

/**
 * Grupperer eventer etter kalenderdag og sorterer dem.
 * Dager uten eventer hoppes over.
 * Returner array sortert kronologisk: [{ nokkel, label, eventer }, ...]
 *
 * @param {Array}       eventer  - Filtrerte, ikke-passerte eventer
 * @param {Object|null} posisjon - Brukerens posisjon eller null
 * @param {boolean}     naerhet  - Om nærhetssortering er aktiv
 * @returns {Array}
 */
export function grupperEtterDag(eventer, posisjon, naerhet) {
  const dagMap = new Map();

  for (const event of eventer) {
    /* Hent YYYY-MM-DD fra start-feltet direkte (de første 10 tegnene) */
    const nokkel = event.start.slice(0, 10);
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
