// hash.js — deterministisk innholds-hash av et eksternt event.
//
// Hasher KUN felter som faktisk betyr noe for selve kilde-dataen (se
// core/sync.js for hvordan den brukes til NEW/UNCHANGED/CHANGED). Hasher
// aldri last_seen_at, collector-tidsstempler eller andre Påby-eide felt —
// de skal ikke trigge en falsk "endring".
//
// snapshotFelter() returnerer disse feltene som et FAST-ORDNET objekt (kun
// streng-nøkler, aldri numeriske) — ES2015+ garanterer iterasjonsrekkefølge
// for streng-nøkler som insert-rekkefølge, så Object.values() under gir
// samme rekkefølge hver gang, på tvers av motorer. contentHash() hasher
// denne rekkefølgen direkte.

import { createHash } from 'crypto';

function t(verdi) {
  return verdi === null || verdi === undefined ? '' : String(verdi);
}

/**
 * Feltene som faktisk betyr noe for selve kilde-dataen — samme felt som
 * contentHash() hasher, bare som et lesbart objekt i stedet for en hash.
 * Lagres som event_sources.content_snapshot (se
 * 011_event_source_changes.sql) slik at vi senere kan si HVILKE felt som
 * endret seg, ikke bare AT noe endret seg.
 *
 * @param {Object} externalEvent  felles external-event-form, se core/sync.js
 * @returns {Object}  flatt øyeblikksbilde, kun primitive verdier
 */
export function snapshotFelter(externalEvent) {
  const e = externalEvent ?? {};
  const venue = e.venue ?? {};
  const pricing = e.pricing ?? {};

  return {
    title: t(e.title),
    description: t(e.description),
    start: t(e.start),
    end: t(e.end),
    venue_name: t(venue.name),
    venue_address: t(venue.address),
    venue_latitude: t(venue.latitude),
    venue_longitude: t(venue.longitude),
    pricing_min: t(pricing.min),
    pricing_max: t(pricing.max),
    pricing_currency: t(pricing.currency),
    pricing_text: t(pricing.text),
    source_url: t(e.sourceUrl),
    image_url: t(e.imageUrl),
    source_status: t(e.sourceStatus),
  };
}

/**
 * @param {Object} externalEvent  felles external-event-form, se core/sync.js
 * @returns {string}  kort, stabil sha1-hash (hex)
 */
export function contentHash(externalEvent) {
  const felter = snapshotFelter(externalEvent);
  return createHash('sha1').update(Object.values(felter).join('|')).digest('hex');
}
