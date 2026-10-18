// tid.js — konverterer en UTC ISO-tidsstreng (slik de fleste eksterne API-er
// leverer, f.eks. "2026-10-17T18:00:00.000Z") til en ISO-streng med
// eksplisitt Oslo-offset (+01:00/+02:00 — aldri hardkodet).
//
// Gjenbruker prosjektets delte Oslo-tidssonelogikk (js/application/oslo-tid.js)
// i stedet for at hver adapter regner ut DST-offset på nytt selv.

import { osloKomponenter, osloLokalTilISO } from '../../js/application/oslo-tid.js';

/**
 * @param {string|null|undefined} isoUTC
 * @returns {string|null}
 */
export function utcIsoTilOsloIso(isoUTC) {
  if (!isoUTC) return null;
  const dato = new Date(isoUTC);
  if (isNaN(dato.getTime())) return null;
  const k = osloKomponenter(dato);
  return osloLokalTilISO(k.år, k.maned, k.dag, k.time, k.min, 0);
}
