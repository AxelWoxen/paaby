// backfill-ticketmaster-affiliate-links.test.mjs — ren logikktest av
// erAffiliateUrl() og vurderRef() (scripts/backfill-ticketmaster-affiliate-links.mjs).
// Ingen database, ingen fetch — bare de rene beslutningsfunksjonene.
//
// Kjør: cd collector && node --test tests/backfill-ticketmaster-affiliate-links.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { contentHash } from '../core/hash.js';
import {
  erAffiliateUrl,
  vurderRef,
  diffFelter,
  HOPP_GRUNN,
} from '../scripts/backfill-ticketmaster-affiliate-links.mjs';

const AFFILIATE_URL =
  'https://ticketmaster.evyy.net/c/7980016/2038767/23900?u=https%3A%2F%2Fwww.ticketmaster.no%2Fevent%2Ftestband-tickets%2F123&utm_medium=affiliate';
const PLAIN_URL = 'https://www.ticketmaster.no/event/testband-tickets/123?language=en-us';

function lagFreskEvent(overrides = {}) {
  return {
    provider: 'ticketmaster',
    externalId: 'tm-123',
    sourceUrl: AFFILIATE_URL,
    sourceStatus: 'scheduled',
    sourceUpdatedAt: null,
    title: 'Testband',
    description: 'En beskrivelse',
    start: '2026-11-01T20:00:00+01:00',
    end: null,
    venue: { name: 'BLÅ', address: null, latitude: null, longitude: null },
    pricing: { min: 100, max: 200, currency: 'NOK', text: null },
    imageUrl: 'https://example.no/bilde.jpg',
    ...overrides,
  };
}

function lagRef(overrides = {}) {
  const fresk = lagFreskEvent();
  return {
    external_id: 'tm-123',
    source_url: PLAIN_URL,
    content_hash: contentHash({ ...fresk, sourceUrl: PLAIN_URL }),
    candidate_id: 'cand-1',
    event_id: null,
    ...overrides,
  };
}

// ─── erAffiliateUrl ─────────────────────────────────────────────────────────

test('gyldig ticketmaster.evyy.net-URL med utm_medium=affiliate → true', () => {
  assert.equal(erAffiliateUrl(AFFILIATE_URL), true);
});

test('affiliate-wrappet universe.com-destinasjon → også true (host er fortsatt evyy.net)', () => {
  const url =
    'https://ticketmaster.evyy.net/c/7980016/2038767/23900?u=https%3A%2F%2Fwww.universe.com%2Fevents%2Fx&utm_medium=affiliate';
  assert.equal(erAffiliateUrl(url), true);
});

test('ren ticketmaster.no-URL (ikke wrappet) → false', () => {
  assert.equal(erAffiliateUrl(PLAIN_URL), false);
});

test('evyy.net uten utm_medium=affiliate → false', () => {
  const url = 'https://ticketmaster.evyy.net/c/7980016/2038767/23900?u=https%3A%2F%2Fx';
  assert.equal(erAffiliateUrl(url), false);
});

test('spoofet underdomene (ikke eksakt ticketmaster.evyy.net) → false', () => {
  const url = 'https://ticketmaster.evyy.net.evil.example/c/x?utm_medium=affiliate';
  assert.equal(erAffiliateUrl(url), false);
});

test('null/undefined/tom streng/ugyldig URL → false', () => {
  assert.equal(erAffiliateUrl(null), false);
  assert.equal(erAffiliateUrl(undefined), false);
  assert.equal(erAffiliateUrl(''), false);
  assert.equal(erAffiliateUrl('ikke en url'), false);
});

// ─── vurderRef ──────────────────────────────────────────────────────────────

test('ingen fersk match fra API → hopp over, IKKE_FUNNET_I_API', () => {
  const plan = vurderRef(lagRef(), null);
  assert.equal(plan.handling, 'hopp');
  assert.equal(plan.grunn, HOPP_GRUNN.IKKE_FUNNET_I_API);
});

test('fersk event har ikke-affiliate URL (f.eks. fortsatt ren ticketmaster.no) → hopp over', () => {
  const fresk = lagFreskEvent({ sourceUrl: PLAIN_URL });
  const plan = vurderRef(lagRef(), fresk);
  assert.equal(plan.handling, 'hopp');
  assert.equal(plan.grunn, HOPP_GRUNN.IKKE_AFFILIATE);
});

test('lagret URL er allerede identisk med den nye affiliate-URL-en → hopp over (idempotens)', () => {
  const fresk = lagFreskEvent();
  const ref = lagRef({ source_url: AFFILIATE_URL });
  const plan = vurderRef(ref, fresk);
  assert.equal(plan.handling, 'hopp');
  assert.equal(plan.grunn, HOPP_GRUNN.ALLEREDE_OPPDATERT);
});

test('andre felt enn URL har også endret seg hos kilden → hopp over, rører ikke raden', () => {
  const fresk = lagFreskEvent({ title: 'Nytt tittel-navn' }); // tittel endret siden sist lagret hash
  const ref = lagRef(); // content_hash er regnet ut fra DEN OPPRINNELIGE tittelen
  const plan = vurderRef(ref, fresk);
  assert.equal(plan.handling, 'hopp');
  assert.equal(plan.grunn, HOPP_GRUNN.ANDRE_FELT_ENDRET);
});

test('kun URL endret, ref peker til candidate (ikke publisert) → oppdater candidate, ikke event', () => {
  const fresk = lagFreskEvent();
  const ref = lagRef({ candidate_id: 'cand-1', event_id: null });
  const plan = vurderRef(ref, fresk);
  assert.equal(plan.handling, 'oppdater');
  assert.equal(plan.nyUrl, AFFILIATE_URL);
  assert.equal(plan.oppdaterCandidate, true);
  assert.equal(plan.oppdaterEvent, false);
  assert.equal(plan.nyContentHash, contentHash(fresk));
});

test('kun URL endret, ref peker til BÅDE candidate og publisert event → oppdater begge', () => {
  const fresk = lagFreskEvent();
  const ref = lagRef({ candidate_id: 'cand-1', event_id: 'event-1' });
  const plan = vurderRef(ref, fresk);
  assert.equal(plan.handling, 'oppdater');
  assert.equal(plan.oppdaterCandidate, true);
  assert.equal(plan.oppdaterEvent, true);
});

test('ref uten candidate_id og uten event_id (foreldreløs) → plan har begge flagg false', () => {
  const fresk = lagFreskEvent();
  const ref = lagRef({ candidate_id: null, event_id: null });
  const plan = vurderRef(ref, fresk);
  assert.equal(plan.handling, 'oppdater');
  assert.equal(plan.oppdaterCandidate, false);
  assert.equal(plan.oppdaterEvent, false);
});

// ─── diffFelter ─────────────────────────────────────────────────────────────

test('diffFelter: ingen lagret rad → tom liste, kaster ikke', () => {
  assert.deepEqual(diffFelter(null, { tittel: 'X' }), []);
});

test('diffFelter: identiske felter → ingen avvik', () => {
  const felter = { tittel: 'Testband', beskrivelse: 'X', start: '2026-11-01T20:00:00+01:00', pris: 100 };
  assert.deepEqual(diffFelter(felter, felter), []);
});

test('diffFelter: kun tittel endret → finner nøyaktig tittel, ikke de andre feltene', () => {
  const lagret = { tittel: 'Myles Sanko', beskrivelse: 'X', start: '2026-10-23T20:00:00+02:00', pris: null };
  const nytt = { tittel: 'Myles Sanko - Flyttet Til Kulturhuset', beskrivelse: 'X', start: '2026-10-23T20:00:00+02:00', pris: null };
  const avvik = diffFelter(lagret, nytt);
  assert.deepEqual(avvik.map((a) => a.felt), ['tittel']);
  assert.equal(avvik[0].gammel, 'Myles Sanko');
  assert.equal(avvik[0].ny, 'Myles Sanko - Flyttet Til Kulturhuset');
});

test('diffFelter: null og manglende felt behandles likt (ikke falskt avvik)', () => {
  const lagret = { tittel: 'X', sted: null };
  const nytt = { tittel: 'X' }; // sted mangler helt i objektet
  assert.deepEqual(diffFelter(lagret, nytt), []);
});

test('vurderRef endrer aldri andre felt enn lenke/hash — ingen tittel/beskrivelse/pris i planen', () => {
  const fresk = lagFreskEvent();
  const ref = lagRef();
  const plan = vurderRef(ref, fresk);
  const tillatteNøkler = new Set([
    'handling', 'nyUrl', 'nyContentHash', 'oppdaterCandidate', 'oppdaterEvent',
  ]);
  for (const nøkkel of Object.keys(plan)) {
    assert.ok(tillatteNøkler.has(nøkkel), `uventet felt i planen: ${nøkkel}`);
  }
});
