/* prisfilter.js — logikk for prisslideren og histogrammet over den.
   Rene funksjoner: ingen DOM, ingen fetch, ingen side-effekter.

   Prisfilteret er et intervall { min, maks }:
   - min:  nedre grense i kr (0 = ingen nedre grense)
   - maks: øvre grense i kr, eller null = ingen øvre grense («700 kr+»)
   Gratis-chipen er bare intervallet { min: 0, maks: 0 }. */

const SKALA_STEG     = 100;   /* Skalaens tak rundes opp til nærmeste 100 kr */
const SKALA_MIN_TAK  = 500;   /* Aldri kortere skala enn 0–500 kr */
const SKALA_MAKS_TAK = 2000;  /* Dyre utliggere skal ikke presse alt inn i første stolpe */

export const SLIDER_STEG   = 10;
export const ANTALL_STOLPER = 30;

const harPris = (pris) => typeof pris === 'number' && !isNaN(pris);

/**
 * Finner taket på prisskalaen fra alle arrangementer. Beregnes én gang
 * ved lasting, slik at slideren ikke hopper når man bytter uke.
 * Priser over taket havner i siste stolpe («tak kr+»).
 */
export function beregnPrisTak(eventer) {
  const priser = eventer.map((e) => e.pris).filter(harPris);
  if (priser.length === 0) return SKALA_MIN_TAK;

  const høyeste = Math.max(...priser);
  const rundet  = Math.ceil(høyeste / SKALA_STEG) * SKALA_STEG;
  return Math.min(SKALA_MAKS_TAK, Math.max(SKALA_MIN_TAK, rundet));
}

/**
 * Teller arrangementer per prisstolpe. Arrangementer uten oppgitt pris
 * telles ikke — de matcher heller ikke prisfilteret.
 *
 * @returns {number[]} lengde `antall`
 */
export function lagHistogram(eventer, tak, antall = ANTALL_STOLPER) {
  const stolper = new Array(antall).fill(0);
  const bredde  = tak / antall;

  for (const e of eventer) {
    if (!harPris(e.pris)) continue;
    const indeks = Math.min(antall - 1, Math.floor(e.pris / bredde));
    stolper[indeks] += 1;
  }
  return stolper;
}

/** Om en pris ligger innenfor intervallet. null-pris matcher aldri. */
export function prisIIntervall(pris, { min, maks }) {
  if (!harPris(pris)) return false;
  if (pris < min) return false;
  if (maks !== null && pris > maks) return false;
  return true;
}

/** Kort, lesbar tekst for intervallet — brukes under slideren og i sporing. */
export function formaterPrisIntervall({ min, maks }) {
  if (maks === 0)              return 'Gratis';
  if (min === 0 && maks === null) return 'Alle priser';
  if (maks === null)           return `Fra ${min} kr`;
  if (min === 0)               return `Opptil ${maks} kr`;
  return `${min}–${maks} kr`;
}
