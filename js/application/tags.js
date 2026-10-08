/* tags.js — v1-tagsystem for events.
   Delt av collector (candidates-db.js, published.js) og backend
   (innsendingService.mjs) — se backend/db/migrations/007_event_tags.sql
   for den relasjonelle siden (tags/event_tags). Listen under MÅ holdes i
   sync med seed-dataen i den migrasjonen.
   Ingen DOM, ingen fetch, ingen side-effekter. */

export const TILLATTE_TAGS = [
  ['free',         'Free'],
  ['drop-in',      'Drop-in'],
  ['ticket',       'Ticket'],
  ['outdoor',      'Outdoor'],
  ['indoor',       'Indoor'],
  ['daytime',      'Daytime'],
  ['evening',      'Evening'],
  ['late-evening', 'Late evening'],
  ['18+',          '18+'],
  ['20+',          '20+'],
  ['live',         'Live'],
  ['dj',           'DJ'],
  ['activity',     'Activity'],
  ['market',       'Market'],
  ['community',    'Community'],
  ['pop-up',       'Pop-up'],
  ['festival',     'Festival'],
];

const GYLDIGE_TAG_SLUGS = new Set(TILLATTE_TAGS.map(([slug]) => slug));

// Mutually eksklusive — nøyaktig én av disse er alltid riktig, siden
// starttid alltid er kjent (NOT NULL i event_occurrences).
const TIDSTAG_SLUGS = ['daytime', 'evening', 'late-evening'];

export function erGyldigTag(slug) {
  return GYLDIGE_TAG_SLUGS.has(slug);
}

// Alle starttidspunkt i systemet lagres allerede som
// "YYYY-MM-DDTHH:MM:SS±TT:00" med Oslo-klokka skrevet rett inn i strengen
// (se osloLokalTilISO/tilNorskTid) — offset-delen er kun tidssone-info for
// andre formål, selve klokketimen står allerede riktig i strengen.
function hentOsloKlokketime(startISO) {
  const match = String(startISO ?? '').match(/^\d{4}-\d{2}-\d{2}T(\d{2}):/);
  return match ? Number(match[1]) : null;
}

// Klokketimer rett etter midnatt (00:00–04:59) hører til kvelden før, ikke
// morgenen etter — et klubbarrangement som starter 01:00 er en fortsettelse
// av late-evening, ikke "daytime". 05:00 er cutoff-en for når døgnet regnes
// som "nytt" igjen.
function beregnTidstag(startISO) {
  const time = hentOsloKlokketime(startISO);
  if (time === null) return null;
  if (time >= 23 || time < 5) return 'late-evening';
  if (time < 18) return 'daytime';
  return 'evening';
}

// true/false = prisen er entydig. null = ukjent/tvetydig → "free" avgjøres
// IKKE automatisk, admin styrer den manuelt.
function beregnErGratis(prisNok) {
  if (prisNok === null || prisNok === undefined || prisNok === '') return null;
  const tall = Number(prisNok);
  if (Number.isNaN(tall)) return null;
  return tall === 0;
}

/**
 * Tar inn tags admin har valgt manuelt + eventets pris/starttid, og
 * returnerer det faktiske tagsettet som skal lagres.
 *
 * - Tidstag (daytime/evening/late-evening) er alltid utledet fra starttid —
 *   den er alltid kjent, så dette er ikke et valg admin gjør.
 * - "free" settes/fjernes automatisk kun når prisen er entydig (0 eller et
 *   positivt tall). Er prisen ukjent (null), beholdes admins eget valg.
 *
 * @param {string[]} valgteTags
 * @param {{ pris: number|string|null, start: string|null }} data
 * @returns {string[]}
 */
export function utledTags(valgteTags, { pris, start } = {}) {
  const valgt = new Set(
    Array.isArray(valgteTags) ? valgteTags.filter(erGyldigTag) : [],
  );

  TIDSTAG_SLUGS.forEach((slug) => valgt.delete(slug));
  const tidstag = beregnTidstag(start);
  if (tidstag) valgt.add(tidstag);

  const erGratis = beregnErGratis(pris);
  if (erGratis === true) valgt.add('free');
  if (erGratis === false) valgt.delete('free');

  return [...valgt];
}
