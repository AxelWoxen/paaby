// hash.js — deterministisk innholds-hash av et eksternt event.
//
// Hasher KUN felter som faktisk betyr noe for selve kilde-dataen (se
// core/sync.js for hvordan den brukes til NEW/UNCHANGED/CHANGED). Hasher
// aldri last_seen_at, collector-tidsstempler eller andre Påby-eide felt —
// de skal ikke trigge en falsk "endring".
//
// Bruker et fast-ordnet array (ikke et objekt) som hash-grunnlag, slik at
// resultatet aldri kan variere med JS sin (vanligvis stabile, men ikke
// garanterte på tvers av motorer) objekt-nøkkelrekkefølge.

import { createHash } from 'crypto';

function t(verdi) {
  return verdi === null || verdi === undefined ? '' : String(verdi);
}

/**
 * @param {Object} externalEvent  felles external-event-form, se core/sync.js
 * @returns {string}  kort, stabil sha1-hash (hex)
 */
export function contentHash(externalEvent) {
  const e = externalEvent ?? {};
  const venue = e.venue ?? {};
  const pricing = e.pricing ?? {};

  const felter = [
    t(e.title),
    t(e.description),
    t(e.start),
    t(e.end),
    t(venue.name),
    t(venue.address),
    t(venue.latitude),
    t(venue.longitude),
    t(pricing.min),
    t(pricing.max),
    t(pricing.currency),
    t(pricing.text),
    t(e.sourceUrl),
    t(e.imageUrl),
    t(e.sourceStatus),
  ];

  return createHash('sha1').update(felter.join('|')).digest('hex');
}
