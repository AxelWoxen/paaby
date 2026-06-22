/* filtre.js — filtreringslogikk.
   Rene funksjoner: ingen DOM, ingen fetch, ingen side-effekter.

   Filterlogikk:
   - Innad i gruppe  = ELLER  (Musikk + Klubb viser begge)
   - Mellom grupper  = OG     (Musikk OG Gratis = gratis musikkeventer)
   - Tom gruppe      = vis alt (ingen kategorifilter = vis alle kategorier) */

/**
 * Filtrerer en liste med eventer basert på aktive filtre.
 *
 * @param {Array}  eventer  - Alle eventer (ufiltrerte)
 * @param {Object} filtre   - { kategori: [], tid: [], pris: [], naerhet: false }
 * @param {Object} posisjon - Brukerens posisjon { lat, lng } eller null
 * @returns {Array} Filtrert liste
 */
export function filtrerEventer(eventer, filtre, posisjon) {
  let resultat = [...eventer];

  /* --- KATEGORI (ELLER) --- */
  if (filtre.kategori.length > 0) {
    resultat = resultat.filter((e) => filtre.kategori.includes(e.kategori));
  }

  /* --- TID (ELLER) --- */
  if (filtre.tid.length > 0) {
    resultat = resultat.filter((e) => {
      const start = new Date(e.start);
      return filtre.tid.some((t) => {
        if (t === 'i-kveld') return erIDag(start);
        if (t === 'i-helga') return erKommendeHelg(start);
        return false;
      });
    });
  }

  /* --- PRIS (ELLER) --- */
  if (filtre.pris.length > 0) {
    resultat = resultat.filter((e) => {
      const pris = e.pris ?? 0;
      return filtre.pris.some((p) => {
        if (p === 'gratis')    return pris === 0;
        if (p === 'under-200') return pris > 0 && pris < 200;
        if (p === 'over-200')  return pris >= 200;
        return false;
      });
    });
  }

  return resultat;
}

/* Sjekker om en dato er i dag (lokal kalenderdag). */
function erIDag(dato) {
  return dato.toDateString() === new Date().toDateString();
}

/**
 * Sjekker om en dato faller på kommende lørdag eller søndag.
 * "Kommende" = fra og med nærmeste lørdag til slutten av søndagen.
 */
function erKommendeHelg(dato) {
  const iDag = new Date();
  iDag.setHours(0, 0, 0, 0);

  /* Finn neste lørdag (getDay: 0=søn, 6=lør) */
  const dagensDag      = iDag.getDay();
  const dagerTilLordag = dagensDag === 6 ? 0 : (6 - dagensDag);

  const lordag = new Date(iDag);
  lordag.setDate(iDag.getDate() + dagerTilLordag);

  const sondag = new Date(lordag);
  sondag.setDate(lordag.getDate() + 1);
  sondag.setHours(23, 59, 59, 999);

  return dato >= lordag && dato <= sondag;
}
