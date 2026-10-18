// hash.test.mjs — ren logikktest av contentHash() (core/hash.js).
//
// Kjør: cd collector && node --test tests/hash.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contentHash } from '../core/hash.js';

function lagEvent(overrides = {}) {
  return {
    title: 'Vassendgutane',
    description: 'Festcountry på sitt beste.',
    start: '2026-10-09T19:00:00+02:00',
    end: '2026-10-09T23:00:00+02:00',
    venue: { name: 'Sentrum Scene', address: 'Arbeidersamfunnets plass 1', latitude: 59.91552, longitude: 10.7518 },
    pricing: { min: 580, max: 580, currency: 'NOK', text: null },
    sourceUrl: 'https://www.ticketmaster.no/event/vassendgutane',
    imageUrl: 'https://ik.imagekit.io/example.jpg',
    sourceStatus: 'scheduled',
    ...overrides,
  };
}

test('deterministisk — samme input gir alltid samme hash', () => {
  const a = contentHash(lagEvent());
  const b = contentHash(lagEvent());
  assert.equal(a, b);
});

test('endret starttid gir en annen hash', () => {
  const a = contentHash(lagEvent());
  const b = contentHash(lagEvent({ start: '2026-10-10T19:00:00+02:00' }));
  assert.notEqual(a, b);
});

test('endret tittel gir en annen hash', () => {
  const a = contentHash(lagEvent());
  const b = contentHash(lagEvent({ title: 'Nytt navn' }));
  assert.notEqual(a, b);
});

test('endret pris gir en annen hash', () => {
  const a = contentHash(lagEvent());
  const b = contentHash(lagEvent({ pricing: { ...lagEvent().pricing, min: 600 } }));
  assert.notEqual(a, b);
});

test('tomt/manglende objekt kaster ikke', () => {
  assert.doesNotThrow(() => contentHash({}));
  assert.doesNotThrow(() => contentHash(undefined));
});

test('null og undefined på samme felt gir samme hash (ikke "null" vs tom streng-forskjell)', () => {
  const a = contentHash(lagEvent({ end: null }));
  const b = contentHash(lagEvent({ end: undefined }));
  assert.equal(a, b);
});
