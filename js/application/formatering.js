/* formatering.js — rene formateringsfunksjoner.
   All tid vises i Europe/Oslo-tidssone, uavhengig av brukerens lokale tidssone.
   Ingen DOM, ingen fetch. */

import { osloKomponenter } from './oslo-tid.js';

const UKEDAGER_KORT = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'];
const MÅNEDER_KORT  = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
const MÅNEDER_LANG  = ['januar', 'februar', 'mars', 'april', 'mai', 'juni',
                       'juli', 'august', 'september', 'oktober', 'november', 'desember'];

/**
 * "Tor 17. jul · 12:00" — vises på kortene.
 */
export function formaterTid(isoStreng) {
  const dato = new Date(isoStreng);
  if (isNaN(dato.getTime())) return '–';
  const k    = osloKomponenter(dato);
  const tid  = `${pad(k.time)}:${pad(k.min)}`;
  return `${kapitaliser(UKEDAGER_KORT[k.ukedag])} ${k.dag}. ${MÅNEDER_KORT[k.maned - 1]} · ${tid}`;
}

/**
 * "tor 17. jul 12:00" — vises i modal faktarad.
 */
export function formaterTidKort(isoStreng) {
  const dato = new Date(isoStreng);
  if (isNaN(dato.getTime())) return '–';
  const k   = osloKomponenter(dato);
  const tid = `${pad(k.time)}:${pad(k.min)}`;
  return `${UKEDAGER_KORT[k.ukedag]} ${k.dag}. ${MÅNEDER_KORT[k.maned - 1]} ${tid}`;
}

/**
 * Formater pris for visning på kort (returnerer tekst, ikke HTML).
 * Bruker prisTekst-feltet når det finnes.
 */
export function formaterPrisTekst(pris, prisTekst) {
  if (prisTekst)           return prisTekst;
  if (pris === null)       return 'Pris ikke oppgitt';
  if ((pris ?? 0) === 0)   return 'Gratis';
  return `${pris} kr`;
}

/**
 * Avstand i km til norsk, lesbar streng.
 * Returner tom streng hvis avstand er ukjent, null eller NaN.
 *
 * Regler:
 *   < 100 m  (< 0,1 km) → "under 100 m unna"
 *   100 m–999 m          → "350 m unna"
 *   ≥ 1 km               → "1,2 km unna" (maks én desimal, norsk komma)
 *
 * @param {number|null} avstandKm - Avstand i kilometer
 * @returns {string}
 */
export function formaterAvstand(avstandKm) {
  if (avstandKm == null || typeof avstandKm !== 'number' || isNaN(avstandKm)) return '';
  if (avstandKm < 0.1) return 'under 100 m unna';
  if (avstandKm < 1)   return `${Math.round(avstandKm * 1000)} m unna`;
  /* Rund til én desimal, bruk norsk tallformat (komma som desimaltegn) */
  const avrundet = Math.round(avstandKm * 10) / 10;
  return `${avrundet.toLocaleString('nb-NO', { maximumFractionDigits: 1 })} km unna`;
}

/**
 * Formater sistVerifisert som "Sjekket i dag", "Sjekket i går" eller "Sjekket 14. jul".
 * Returnerer null dersom feltet mangler eller er ugyldig.
 *
 * @param {string|null|undefined} isoStreng
 * @param {Date} [nå]
 * @returns {string|null}
 */
export function formaterVerifisert(isoStreng, nå = new Date()) {
  if (!isoStreng) return null;
  const dato = new Date(isoStreng);
  if (isNaN(dato.getTime())) return null;

  const kDato = osloKomponenter(dato);
  const kNå   = osloKomponenter(nå);

  /* Er det i dag? */
  if (kDato.år === kNå.år && kDato.maned === kNå.maned && kDato.dag === kNå.dag) {
    return 'Sjekket i dag';
  }

  /* Er det i går? */
  const iGår  = new Date(nå.getTime() - 24 * 60 * 60 * 1000);
  const kIGår = osloKomponenter(iGår);
  if (kDato.år === kIGår.år && kDato.maned === kIGår.maned && kDato.dag === kIGår.dag) {
    return 'Sjekket i går';
  }

  return `Sjekket ${kDato.dag}. ${MÅNEDER_KORT[kDato.maned - 1]}`;
}

/**
 * Dag-label for feed-overskrifter: "I dag · torsdag 16. juli" eller "Fredag 17. juli".
 *
 * @param {string} datoNokkel  "YYYY-MM-DD" (i Oslo-tid)
 * @param {Date}   [nå]
 * @returns {string}
 */
export function lagDagLabel(datoNokkel, nå = new Date()) {
  /* Konstruer Date fra nøkkelen i Oslo-tid (T12:00 unngår DST-kanttilfeller) */
  const dato     = new Date(datoNokkel + 'T12:00:00+02:00');
  const k        = osloKomponenter(dato);
  const kNå      = osloKomponenter(nå);
  const iDag     = kNå.år === k.år && kNå.maned === k.maned && kNå.dag === k.dag;
  const ukedag   = UKEDAGER_KORT[k.ukedag];
  const ukedagLang = MÅNEDER_LANG[0]; /* holder plassen — se under */
  const ukedagFull = ['søndag','mandag','tirsdag','onsdag','torsdag','fredag','lørdag'][k.ukedag];
  const måned    = MÅNEDER_LANG[k.maned - 1];

  if (iDag) return `I dag · ${ukedagFull} ${k.dag}. ${måned}`;
  return `${kapitaliser(ukedagFull)} ${k.dag}. ${måned}`;
}

/** Stor forbokstav. */
export function kapitaliser(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/** Korrekt visningsnavn for kategori — håndterer ASCII-interne verdier (f.eks. pafunn → Påfunn). */
const KATEGORI_NAVN = Object.freeze({
  musikk: 'Musikk',
  klubb:  'Klubb',
  pafunn: 'Påfunn',
});

export function kategoriVisningsnavn(kategori) {
  return KATEGORI_NAVN[kategori] ?? kapitaliser(kategori ?? '');
}

/* Nuller-pad til to siffer. */
function pad(n) {
  return String(n).padStart(2, '0');
}
