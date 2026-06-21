/* filtre.js — filtreringslogikk.
   Eneste ansvar: ta en liste eventer + aktive filtre, returnere filtrert liste.
   Ingen DOM, ingen fetch, ingen side-effekter. Ren inn/ut-funksjon. */

/**
 * Filtrerer og (eventuelt) sorterer en liste med eventer.
 *
 * @param {Array}  eventer        - Alle eventer (ufiltrerte)
 * @param {Object} filtre         - Aktive filtre: { kategori, tid, pris, naerhet }
 * @param {Object|null} posisjon  - Brukerens posisjon { lat, lng }, eller null
 * @returns {Array} Filtrert (og eventuelt sortert) liste
 */
export function filtrerEventer(eventer, filtre, posisjon) {
  /* Vi kopierer lista med spread (...) så vi aldri muterer originalen */
  let resultat = [...eventer];

  /* --- KATEGORIFILTER --- */
  if (filtre.kategori) {
    resultat = resultat.filter((e) => e.kategori === filtre.kategori);
  }

  /* --- TIDSFILTER --- */
  if (filtre.tid === 'i-kveld') {
    /* "I kveld" = eventer som starter samme kalenderdag som i dag */
    const iDagStreng = new Date().toDateString();
    resultat = resultat.filter(
      (e) => new Date(e.start).toDateString() === iDagStreng
    );
  } else if (filtre.tid === 'i-helga') {
    /* "I helga" = eventer som starter på nærmeste kommende lørdag eller søndag */
    resultat = resultat.filter((e) => erKommendeHelg(new Date(e.start)));
  }

  /* --- PRISFILTER --- */
  if (filtre.pris === 'gratis') {
    resultat = resultat.filter((e) => e.pris === 0);
  } else if (filtre.pris === 'under-200') {
    resultat = resultat.filter((e) => e.pris > 0 && e.pris < 200);
  } else if (filtre.pris === 'over-200') {
    resultat = resultat.filter((e) => e.pris >= 200);
  }

  /* --- NÆRHETSSORTERING ---
     Sorter etter avstand kun hvis brukeren har valgt filteret OG posisjon er kjent.
     _avstand er lagt på eventene av main.js etter at posisjon ble hentet. */
  if (filtre.naerhet && posisjon) {
    resultat = resultat.sort((a, b) => {
      /* Eventer uten avstandsdata skyves til bunnen */
      const aAvstand = a._avstand ?? Infinity;
      const bAvstand = b._avstand ?? Infinity;
      return aAvstand - bAvstand;
    });
  }

  return resultat;
}

/**
 * Sjekker om en dato faller på kommende lørdag eller søndag.
 * "Kommende" betyr: fra og med i dag til og med søndag denne uken,
 * eller neste lørdag og søndag hvis vi er midt i uken.
 *
 * @param {Date} dato
 * @returns {boolean}
 */
function erKommendeHelg(dato) {
  const iDag = new Date();
  /* Sett klokkeslett til midnatt så vi bare sammenligner datoer */
  iDag.setHours(0, 0, 0, 0);

  /* Finn nærmeste lørdag (dag 6) */
  const dagensDag = iDag.getDay(); /* 0=søndag, 1=mandag, ..., 6=lørdag */
  const dagerTilLordag = dagensDag === 6 ? 0 : (6 - dagensDag);

  const lordag = new Date(iDag);
  lordag.setDate(iDag.getDate() + dagerTilLordag);

  const sondag = new Date(lordag);
  sondag.setDate(lordag.getDate() + 1);
  sondag.setHours(23, 59, 59, 999); /* Til slutten av søndagen */

  return dato >= lordag && dato <= sondag;
}
