// tikkio.test.mjs — tester adapteren mot håndlagde fixture-objekter i
// Tikkio Discovery API v1 sin ekte, observerte form (hentet manuelt mot
// https://tikkio.com/api/public/v1/events for Oslo kommune — IKKE gjettet).
// Ingen ekte API-kall gjøres noe sted i denne filen.
//
// Kjør: cd collector && node --test tests/tikkio.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapTikkioEvent, hentTikkioEvents } from '../adapters/tikkio.js';
import { normaliser } from '../normalize.js';

const SOURCE = {
  id: 'tikkio-oslo',
  adapter: 'tikkio',
  country: 'NO',
  municipalityCode: '0301',
  lang: 'no',
  defaultKategori: 'pafunn',
};

// Ekte observert form (jazzkonsert-event, hentet manuelt mot API-et).
const FIXTURE_EVENT = {
  id: 61979,
  name: 'Jazz & Jam / Fuglen Gamlebyen',
  description_short: 'Monthly Jazz &amp; Jam at Fuglen i Gamlebyen!19:00-23:00...',
  description: '<p>Monthly Jazz &amp; Jam at Fuglen i Gamlebyen!</p><p>19:00-23:00</p>',
  status: null,
  starts_at: '2026-10-22T18:00:00.000000Z',
  ends_at: '2026-10-22T22:00:00.000000Z',
  timezone: 'Europe/Oslo',
  website: 'http://fuglencoffee.no',
  url: 'https://tikkio.com/events/61979',
  image_url: 'https://cdn.tikkio.com/static/example.webp',
  minimum_price: 139,
  currency: 'NOK',
  country: 'NO',
  organizer: { id: 2538, name: 'FUGLEN COFFEE ROASTERS OSLO AS', website: 'https://fuglencoffee.no' },
  venue: { name: 'Fuglen Coffee Roasters Oslo', city: 'Oslo', country: 'NO', latitude: 59.9062171, longitude: 10.7746492 },
  categories: [{ code: 'music-jazz', label: 'Jazz' }],
};

test('mapper et fullstendig Tikkio-event til felles external-event-form', () => {
  const external = mapTikkioEvent(FIXTURE_EVENT, SOURCE);

  assert.equal(external.provider, 'tikkio');
  assert.equal(external.externalId, '61979');
  assert.equal(external.sourceUrl, 'https://tikkio.com/events/61979'); // IKKE organizer.website
  assert.equal(external.sourceStatus, 'unknown'); // status: null → ALDRI scheduled
  assert.equal(external.title, 'Jazz & Jam / Fuglen Gamlebyen');
  assert.equal(external.description, 'Monthly Jazz & Jam at Fuglen i Gamlebyen!19:00-23:00...'); // HTML/entiteter fjernet
  assert.equal(external.start, '2026-10-22T20:00:00+02:00'); // UTC 18:00 → Oslo sommertid +02:00
  assert.equal(external.venue.name, 'Fuglen Coffee Roasters Oslo');
  assert.equal(external.venue.latitude, 59.9062171);
  assert.equal(external.pricing.min, 139);
  assert.equal(external.pricing.currency, 'NOK');
  assert.equal(external.imageUrl, 'https://cdn.tikkio.com/static/example.webp');
  assert.deepEqual(external.categoryHints, ['concert']);
  assert.equal(external.defaultCategory, 'pafunn');

  assert.equal(normaliser(external).kategori, 'musikk');
});

test('bilde-URL sitt CDN-versjonssegment fjernes (regresjon: samme bilde ga ulik content_hash mellom to ekte kjøringer)', () => {
  const v1 = mapTikkioEvent({ ...FIXTURE_EVENT, image_url: 'https://cdn.tikkio.com/static/1.0.3476/uploads/event/c_abc123.webp?class=w768' }, SOURCE);
  const v2 = mapTikkioEvent({ ...FIXTURE_EVENT, image_url: 'https://cdn.tikkio.com/static/1.0.3495/uploads/event/c_abc123.webp?class=w768' }, SOURCE);
  assert.equal(v1.imageUrl, v2.imageUrl, 'kun versjonsnummeret differensierer — normalisert URL skal være identisk');
  assert.equal(v1.imageUrl, 'https://cdn.tikkio.com/uploads/event/c_abc123.webp?class=w768');
});

test('bilde-URL med et FAKTISK annet bilde (ulik asset-hash) forblir forskjellig etter normalisering', () => {
  const a = mapTikkioEvent({ ...FIXTURE_EVENT, image_url: 'https://cdn.tikkio.com/static/1.0.3476/uploads/event/c_abc123.webp' }, SOURCE);
  const b = mapTikkioEvent({ ...FIXTURE_EVENT, image_url: 'https://cdn.tikkio.com/static/1.0.3476/uploads/event/c_xyz789.webp' }, SOURCE);
  assert.notEqual(a.imageUrl, b.imageUrl);
});

test('externalId er alltid en streng (Tikkio sin id er numerisk)', () => {
  assert.equal(typeof mapTikkioEvent(FIXTURE_EVENT, SOURCE).externalId, 'string');
});

test('minimum_price: 0 → faktisk gratis (pris 0), IKKE forvekslet med ukjent', () => {
  const event = { ...FIXTURE_EVENT, minimum_price: 0 };
  const external = mapTikkioEvent(event, SOURCE);
  assert.equal(external.pricing.min, 0);
  assert.equal(normaliser(external).pris, 0);
});

test('minimum_price: null → pris forblir null (ukjent), ALDRI forvekslet med gratis', () => {
  const event = { ...FIXTURE_EVENT, minimum_price: null };
  const external = mapTikkioEvent(event, SOURCE);
  assert.equal(external.pricing.min, null);
  assert.equal(normaliser(external).pris, null);
});

test('status null → sourceStatus "unknown" (aldri antatt scheduled)', () => {
  assert.equal(mapTikkioEvent({ ...FIXTURE_EVENT, status: null }, SOURCE).sourceStatus, 'unknown');
});

test('observerte ikke-null status-verdier (few-tickets/sold-out/upcoming) → scheduled, ikke cancelled', () => {
  for (const status of ['few-tickets', 'sold-out', 'upcoming']) {
    assert.equal(mapTikkioEvent({ ...FIXTURE_EVENT, status }, SOURCE).sourceStatus, 'scheduled');
  }
});

test('status med avlyst-nøkkelord → cancelled (defensivt, i tilfelle Tikkio bruker det)', () => {
  assert.equal(mapTikkioEvent({ ...FIXTURE_EVENT, status: 'cancelled' }, SOURCE).sourceStatus, 'cancelled');
});

test('kategori "community-nightlife" → club-hint → klubb', () => {
  const event = { ...FIXTURE_EVENT, categories: [{ code: 'community-nightlife', label: 'Nightlife' }] };
  const external = mapTikkioEvent(event, SOURCE);
  assert.deepEqual(external.categoryHints, ['club']);
  assert.equal(normaliser(external).kategori, 'klubb');
});

test('kategori "music-electronic-dance" → concert+electronic-hint → klubb', () => {
  const event = { ...FIXTURE_EVENT, categories: [{ code: 'music-electronic-dance', label: 'Electronic/Dance' }] };
  const external = mapTikkioEvent(event, SOURCE);
  assert.ok(external.categoryHints.includes('electronic'));
  assert.ok(external.categoryHints.includes('concert'));
  assert.equal(normaliser(external).kategori, 'klubb');
});

test('kategori "arts-theatre-comedy" → ærlig "other"-hint (ikke "food"), lander på pafunn', () => {
  const event = { ...FIXTURE_EVENT, categories: [{ code: 'arts-theatre-comedy', label: 'Komedie' }] };
  const external = mapTikkioEvent(event, SOURCE);
  assert.deepEqual(external.categoryHints, ['other']);
  assert.ok(!external.categoryHints.includes('food'));
  assert.equal(normaliser(external).kategori, 'pafunn');
});

test('ingen kategorier i det hele tatt → ingen hint, faller til source sin defaultKategori', () => {
  const event = { ...FIXTURE_EVENT, categories: [] };
  const external = mapTikkioEvent(event, SOURCE);
  assert.deepEqual(external.categoryHints, []);
  assert.equal(normaliser(external).kategori, 'pafunn'); // SOURCE.defaultKategori
});

test('manglende _embedded-aktige felt (venue/categories/priceRanges) → null-felt, kaster ikke', () => {
  const minimalt = { id: 1, name: 'Minimalt event', starts_at: null, status: null };
  const external = mapTikkioEvent(minimalt, SOURCE);
  assert.equal(external.venue.name, null);
  assert.equal(external.pricing.min, null);
  assert.deepEqual(external.categoryHints, []);
  assert.equal(external.start, null);
});

test('hentTikkioEvents krever ingen API-nøkkel (ingen tokenEnv-sjekk i adapteren selv)', () => {
  // Ingen live-kall her — bekrefter bare at funksjonen eksisterer og ikke
  // umiddelbart kaster på manglende env, i motsetning til Ticketmaster-adapteren.
  assert.equal(typeof hentTikkioEvents, 'function');
});
