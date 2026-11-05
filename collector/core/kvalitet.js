// kvalitet.js — hvilken informasjon mangler et påby-event før det er et
// godt kort på paaby.no? Ren funksjon, ingen DB.
//
// Grunnlaget er det vi faktisk har: frontendens validering
// (js/application/validering.js — det som gjør at et event FORSVINNER fra
// paaby.no) og de håndplukkede eventene i data/events.json (64 stk), der
// sted/adresse/beskrivelse/lenke finnes på ~100 %, koordinater på 95 %,
// pris på ~95 % og bilde på ~55 % (resten får kategoribildet).
//
// Nivåer:
//   kritisk    — frontend dropper eventet, eller det kan ikke publiseres
//   viktig     — eventet vises, men kortet blir dårligere (ingen kart,
//                ingen avstand, ingen billettlenke, kategoribilde, …)
//   kuratering — fylles alltid inn av en person (kuratortekst)

import { erGyldigUrl } from '../../js/application/validering.js';

const TILLATTE_KATEGORIER = new Set(['musikk', 'klubb', 'pafunn']);
const HAR_TIDSSONE = /Z$|[+-]\d{2}:\d{2}$/;

function tom(verdi) {
  return verdi === null || verdi === undefined || (typeof verdi === 'string' && verdi.trim() === '');
}

/**
 * @param {Object} event  påby-eventform (normalize.js / candidate-payload)
 * @returns {{ felt: string, nivå: 'kritisk'|'viktig'|'kuratering', hvorfor: string }[]}
 */
export function finnManglendeFelter(event) {
  const e = event ?? {};
  const mangler = [];
  const legg = (felt, nivå, hvorfor) => mangler.push({ felt, nivå, hvorfor });

  if (tom(e.tittel)) legg('tittel', 'kritisk', 'påkrevd');
  if (tom(e.start) || !HAR_TIDSSONE.test(e.start) || Number.isNaN(new Date(e.start).getTime())) {
    legg('start', 'kritisk', 'påkrevd, med tidssone');
  }
  if (!TILLATTE_KATEGORIER.has(e.kategori)) legg('kategori', 'kritisk', 'musikk/klubb/pafunn');
  if (!tom(e.slutt) && !tom(e.start) && new Date(e.slutt) <= new Date(e.start)) {
    legg('slutt', 'kritisk', 'slutt er før start');
  }
  if (!tom(e.lenke) && !erGyldigUrl(e.lenke)) legg('lenke', 'kritisk', 'ugyldig URL');

  if (tom(e.sted)) legg('sted', 'viktig', 'vises på kortet');
  if (tom(e.adresse)) legg('adresse', 'viktig', 'kartlenke');
  if (e.lat == null || e.lng == null) legg('koordinater', 'viktig', 'kart og avstand');
  if (tom(e.lenke)) legg('lenke', 'viktig', 'billett / info');
  if (tom(e.bilde)) legg('bilde', 'viktig', 'ellers kategoribilde');
  if (e.pris == null && tom(e.prisTekst)) legg('pris', 'viktig', 'pris eller pristekst');
  if (tom(e.beskrivelse)) legg('beskrivelse', 'viktig', 'vises i popup');

  if (tom(e.kuratortekst)) legg('kuratortekst', 'kuratering', 'Påbys egen stemme');

  return mangler;
}

/**
 * Kort liste med feltnavn for lagring i event_candidates.missing_fields —
 * kuratortekst tas ikke med (den mangler alltid på collector-funn, og ville
 * bare vært støy i lista).
 */
export function manglendeFeltnavn(event) {
  return [...new Set(
    finnManglendeFelter(event)
      .filter((m) => m.nivå !== 'kuratering')
      .map((m) => m.felt),
  )];
}

/**
 * Fyller inn adresse/koordinater fra et sted vi allerede kjenner (venues-
 * tabellen, kuratert gjennom tidligere publiserte events). Overskriver
 * ALDRI en verdi kilden faktisk oppga — kun null-felt.
 *
 * @param {Object} event
 * @param {Map<string, { address, latitude, longitude }>} kjenteSteder  nøkkel = stedSlug()
 * @returns {{ event: Object, fylt: string[] }}
 */
export function berikFraKjentSted(event, kjenteSteder) {
  if (!event?.sted || !kjenteSteder?.size) return { event, fylt: [] };
  const kjent = kjenteSteder.get(stedSlug(event.sted));
  if (!kjent) return { event, fylt: [] };

  const beriket = { ...event };
  const fylt = [];
  if (tom(beriket.adresse) && kjent.address) {
    beriket.adresse = kjent.address;
    fylt.push('adresse');
  }
  if ((beriket.lat == null || beriket.lng == null) && kjent.latitude != null && kjent.longitude != null) {
    beriket.lat = kjent.latitude;
    beriket.lng = kjent.longitude;
    fylt.push('koordinater');
  }
  return { event: beriket, fylt };
}

// Samme slug som venues.slug (collector/store/published.js:lagSlug), slik
// at et oppslag her treffer nøyaktig samme rad som publisering ville laget.
export function stedSlug(tekst) {
  return String(tekst ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
