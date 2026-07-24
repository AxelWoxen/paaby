/* filtre.js — filtreringslogikk.
   Rene funksjoner: ingen DOM, ingen fetch, ingen side-effekter.

   Filterlogikk:
   - Kategori:  ELLER innad i gruppen  (Musikk + Klubb → viser begge)
   - Tid:       enkeltvalg (i-kveld ELLER i-helga, ikke begge)
   - Pris:      enkeltvalg
   - Mellom grupper: OG  (Musikk OG Gratis → gratis musikkarrangementer)
   - Tom gruppe: vis alt */

import { osloKomponenter, lagOsloDato } from './oslo-tid.js';

/**
 * Filtrerer en liste med arrangementer basert på aktive filtre.
 *
 * @param {Array}  eventer   - Alle arrangementer (ufiltrerte)
 * @param {Object} filtre    - { kategori: [], tid: string|null, pris: string|null, naerhet: false }
 * @param {Object} posisjon  - { lat, lng } eller null
 * @returns {Array}
 */
export function filtrerEventer(eventer, filtre, posisjon) {
  let resultat = [...eventer];

  /* --- KATEGORI (ELLER) --- */
  if (filtre.kategori.length > 0) {
    resultat = resultat.filter((e) => filtre.kategori.includes(e.kategori));
  }

  /* --- TID (enkeltvalg) --- */
  if (filtre.tid) {
    resultat = resultat.filter((e) => {
      const start = new Date(e.start);
      if (filtre.tid === 'i-kveld') return erIDag(start);
      if (filtre.tid === 'i-helga') return erIHelga(start);
      return false;
    });
  }

  /* --- PRIS (enkeltvalg) ---
     Gratis:    pris === 0
     Under 200: pris < 200 (inkluderer gratis)
     200 kr+:   pris >= 200
     null pris matcher ingen prisfiltre */
  if (filtre.pris) {
    resultat = resultat.filter((e) => {
      const pris = e.pris;
      if (pris === null || pris === undefined) return false;
      if (filtre.pris === 'gratis')    return pris === 0;
      if (filtre.pris === 'under-200') return pris < 200;
      if (filtre.pris === 'over-200')  return pris >= 200;
      return false;
    });
  }

  return resultat;
}

/* Sjekker om et tidspunkt er i dag i Oslo-tid. */
function erIDag(dato, nå = new Date()) {
  const k  = osloKomponenter(dato);
  const kN = osloKomponenter(nå);
  return k.år === kN.år && k.maned === kN.maned && k.dag === kN.dag;
}

/**
 * Sjekker om et tidspunkt faller innenfor helgevinduet for "nå".
 *
 * Helg = fredag kl. 16:00 til søndag kl. 23:59:59 i Europe/Oslo.
 *
 * Hvilken helg:
 *   Man–tor:         kommende helg (neste fre–søn)
 *   Fre (før 16:00): denne helgen (fre 16:00 → søn 23:59:59)
 *   Fre (≥ 16:00), lør, søn: pågående helg
 *   Etter søn 23:59: neste helg
 *
 * @param {Date} dato   - arrangementsstart (UTC)
 * @param {Date} [nå]   - nåværende tidspunkt (valgfri, for testing)
 */
export function erIHelga(dato, nå = new Date()) {
  const nåK = osloKomponenter(nå);

  /* Finn antall dager til/fra fredagen som starter "vår" helg.
     ukedag: 0=søn, 1=man … 5=fre, 6=lør */
  const DAGER_TIL_FREDAG = [
    -2,  /* søn → forrige fre */
    4,   /* man → neste fre */
    3,   /* tir → neste fre */
    2,   /* ons → neste fre */
    1,   /* tor → neste fre */
    0,   /* fre → denne fre */
    -1,  /* lør → forrige fre */
  ];
  const dagerTilFre = DAGER_TIL_FREDAG[nåK.ukedag];

  /* Finn Oslo-midnatt for "i dag", legg til dager for å nå fredagen */
  const midnattIDag = lagOsloDato(nåK.år, nåK.maned, nåK.dag, 0, 0, 0);
  const fredagMidnatt = new Date(midnattIDag.getTime() + dagerTilFre * 86_400_000);
  const fredagK = osloKomponenter(fredagMidnatt);

  /* Helgstart: fredag kl. 16:00 i Oslo */
  const helgStart = lagOsloDato(fredagK.år, fredagK.maned, fredagK.dag, 16, 0, 0);

  /* Helgslutt: søndag (fredag + 2 dager) kl. 23:59:59 i Oslo */
  const søndagMidnatt = new Date(fredagMidnatt.getTime() + 2 * 86_400_000);
  const søndagK = osloKomponenter(søndagMidnatt);
  const helgSlutt = lagOsloDato(søndagK.år, søndagK.maned, søndagK.dag, 23, 59, 59);

  return dato >= helgStart && dato <= helgSlutt;
}
