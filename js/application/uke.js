/* uke.js — uke-vindu for feed-navigering ("se alle eventer" bladd uke for uke).
   Uke = mandag 00:00 til søndag 23:59:59 i Europe/Oslo-tid (ISO 8601-uke).
   Rene funksjoner: ingen DOM, ingen fetch, ingen side-effekter. */

import { osloKomponenter, lagOsloDato } from './oslo-tid.js';

const MÅNEDER_KORT = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];

/**
 * Mandag 00:00 (Oslo-tid) i uka som inneholder `nå`.
 *
 * @param {Date} [nå]
 * @returns {Date}
 */
export function ukeMandag(nå = new Date()) {
  const k = osloKomponenter(nå);
  /* Dager siden mandag: søn(0)→6, man(1)→0, tir(2)→1 … lør(6)→5 */
  const dagerSidenMandag = (k.ukedag + 6) % 7;
  const iDagMidnatt = lagOsloDato(k.år, k.maned, k.dag, 0, 0, 0);
  return new Date(iDagMidnatt.getTime() - dagerSidenMandag * 86_400_000);
}

/**
 * Start (inkl.) og slutt (eksl.) for uka `ukeOffset` uker etter `mandagDenneUka`.
 *
 * @param {Date}   mandagDenneUka  - fra ukeMandag()
 * @param {number} ukeOffset       - 0 = denne uka, 1 = neste uke, osv.
 * @returns {{ fra: Date, til: Date }}
 */
export function ukeVindu(mandagDenneUka, ukeOffset) {
  const fra = new Date(mandagDenneUka.getTime() + ukeOffset * 7 * 86_400_000);
  const til = new Date(fra.getTime() + 7 * 86_400_000);
  return { fra, til };
}

/**
 * Filtrerer eventer til de som starter innenfor uke-vinduet [fra, til).
 *
 * @param {Array} eventer
 * @param {Date}  fra
 * @param {Date}  til
 * @returns {Array}
 */
export function filtrerTilUke(eventer, fra, til) {
  return eventer.filter((e) => {
    const start = new Date(e.start);
    return start >= fra && start < til;
  });
}

/* ISO 8601-ukenummer — uka regnes til det året torsdagen i uka faller i. */
function isoUkenummer(k) {
  const d = new Date(Date.UTC(k.år, k.maned - 1, k.dag));
  const ukedagIso = (d.getUTCDay() + 6) % 7; /* 0 = mandag */
  d.setUTCDate(d.getUTCDate() - ukedagIso + 3); /* torsdag i samme ISO-uke */
  const årStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - årStart) / 86_400_000) + 1) / 7);
}

/**
 * Klartekst-label for uke-navigasjonen.
 * "Denne uka" for inneværende uke, ellers "Uke 31 · 27. jul–2. aug".
 *
 * @param {Date}   mandagDenneUka
 * @param {number} ukeOffset
 * @returns {string}
 */
export function ukeLabel(mandagDenneUka, ukeOffset) {
  if (ukeOffset === 0) return 'Denne uka';

  const { fra } = ukeVindu(mandagDenneUka, ukeOffset);
  const søndag  = new Date(fra.getTime() + 6 * 86_400_000);

  const kFra = osloKomponenter(fra);
  const kTil = osloKomponenter(søndag);
  const uke  = isoUkenummer(kFra);

  const fraTekst = kFra.maned === kTil.maned
    ? `${kFra.dag}.`
    : `${kFra.dag}. ${MÅNEDER_KORT[kFra.maned - 1]}`;
  const tilTekst = `${kTil.dag}. ${MÅNEDER_KORT[kTil.maned - 1]}`;

  return `Uke ${uke} · ${fraTekst}–${tilTekst}`;
}
