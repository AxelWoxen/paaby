// ticketmaster.test.mjs — tester adapteren MOT et håndlaget fixture-objekt
// i Ticketmaster Discovery API v2 sin dokumenterte form. Ingen ekte API-kall
// gjøres noe sted i denne filen.
//
// Kjør: cd collector && node --test tests/ticketmaster.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapTicketmasterEvent, hentTicketmasterEvents } from '../adapters/ticketmaster.js';
import { normaliser } from '../normalize.js';

const SOURCE = {
  id: 'ticketmaster-no',
  adapter: 'ticketmaster',
  tokenEnv: 'TICKETMASTER_API_KEY',
  countryCode: 'NO',
  city: 'Oslo',
  defaultKategori: 'musikk',
};

// Form hentet fra Ticketmaster Discovery API v2 sin offentlige dokumentasjon
// (https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/)
// — IKKE verifisert mot et ekte svar i dette prosjektet.
const FIXTURE_EVENT = {
  id: 'vvG1zZ9kGmKAWL',
  name: 'Test Artist',
  url: 'https://www.ticketmaster.no/event/test-artist-billetter/123',
  info: 'En testkonsert.',
  images: [
    { url: 'https://example.com/small.jpg', width: 200, height: 100 },
    { url: 'https://example.com/large.jpg', width: 1024, height: 512 },
  ],
  dates: {
    start: { localDate: '2026-11-15', localTime: '20:00:00', dateTime: '2026-11-15T19:00:00Z' },
    status: { code: 'onsale' },
  },
  classifications: [
    { segment: { name: 'Music' }, genre: { name: 'Dance/Electronic' } },
  ],
  priceRanges: [{ type: 'standard', currency: 'NOK', min: 250, max: 450 }],
  _embedded: {
    venues: [{
      name: 'Rockefeller',
      address: { line1: 'Torggata 16' },
      location: { latitude: '59.9139', longitude: '10.7389' },
    }],
  },
};

test('mapper et fullstendig Discovery-event til felles external-event-form', () => {
  const external = mapTicketmasterEvent(FIXTURE_EVENT, SOURCE);

  assert.equal(external.provider, 'ticketmaster');
  assert.equal(external.externalId, 'vvG1zZ9kGmKAWL');
  assert.equal(external.sourceUrl, 'https://www.ticketmaster.no/event/test-artist-billetter/123');
  assert.equal(external.sourceStatus, 'scheduled');
  assert.equal(external.title, 'Test Artist');
  assert.equal(external.start, '2026-11-15T20:00:00+01:00'); // UTC 19:00 → Oslo vintertid +01:00
  assert.equal(external.venue.name, 'Rockefeller');
  assert.equal(external.venue.address, 'Torggata 16');
  assert.equal(external.venue.latitude, 59.9139);
  assert.equal(external.venue.longitude, 10.7389);
  assert.equal(external.pricing.min, 250);
  assert.equal(external.pricing.max, 450);
  assert.equal(external.pricing.currency, 'NOK');
  assert.equal(external.imageUrl, 'https://example.com/large.jpg'); // bredest bilde valgt
  assert.deepEqual(external.categoryHints, ['concert', 'electronic']);
  assert.equal(external.defaultCategory, 'musikk');
});

test('status "cancelled" mappes til sourceStatus cancelled', () => {
  const event = { ...FIXTURE_EVENT, dates: { ...FIXTURE_EVENT.dates, status: { code: 'cancelled' } } };
  assert.equal(mapTicketmasterEvent(event, SOURCE).sourceStatus, 'cancelled');
});

test('status "rescheduled" mappes til sourceStatus postponed', () => {
  const event = { ...FIXTURE_EVENT, dates: { ...FIXTURE_EVENT.dates, status: { code: 'rescheduled' } } };
  assert.equal(mapTicketmasterEvent(event, SOURCE).sourceStatus, 'postponed');
});

test('manglende _embedded.venues/classifications/priceRanges → null-felt, kaster ikke', () => {
  const minimalt = { id: 'x1', name: 'Minimalt event', url: null, dates: { start: {}, status: {} } };
  const external = mapTicketmasterEvent(minimalt, SOURCE);
  assert.equal(external.venue.name, null);
  assert.equal(external.pricing.min, null);
  assert.deepEqual(external.categoryHints, []);
  assert.equal(external.start, null);
});

test('segment "Arts & Theatre" → ærlig "other"-hint (ikke "food"), som lander på pafunn', () => {
  const event = {
    ...FIXTURE_EVENT,
    classifications: [{ segment: { name: 'Arts & Theatre' }, genre: { name: 'Theatre' } }],
  };
  const external = mapTicketmasterEvent(event, SOURCE);

  assert.deepEqual(external.categoryHints, ['other']);
  assert.ok(!external.categoryHints.includes('food'), '"food" skal aldri brukes som kunstig non-music-hint');

  // Bekreft at normalize.js faktisk tolker "other" riktig helt til Påby-kategori.
  assert.equal(normaliser(external).kategori, 'pafunn');
});

test('segment "Miscellaneous" → samme ærlige "other"-hint', () => {
  const event = {
    ...FIXTURE_EVENT,
    classifications: [{ segment: { name: 'Miscellaneous' }, genre: { name: '' } }],
  };
  const external = mapTicketmasterEvent(event, SOURCE);
  assert.deepEqual(external.categoryHints, ['other']);
  assert.equal(normaliser(external).kategori, 'pafunn');
});

test('manglende TICKETMASTER_API_KEY → tydelig feil, ingen nettverkskall', async () => {
  const opprinnelig = process.env.TICKETMASTER_API_KEY;
  delete process.env.TICKETMASTER_API_KEY;
  try {
    await assert.rejects(
      () => hentTicketmasterEvents(SOURCE),
      /TICKETMASTER_API_KEY/,
    );
  } finally {
    if (opprinnelig !== undefined) process.env.TICKETMASTER_API_KEY = opprinnelig;
  }
});
