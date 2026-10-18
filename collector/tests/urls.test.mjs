// urls.test.mjs — ren logikktest av normaliserUrl() (core/urls.js).
// Ingen server, ingen database.
//
// Kjør: cd collector && node --test tests/urls.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliserUrl } from '../core/urls.js';

test('gyldig https-url beholdes uendret, inkl. query params', () => {
  const url = 'https://www.ticketmaster.no/event/abc?utm_source=paaby&ref=123';
  assert.equal(normaliserUrl(url), url);
});

test('gyldig http-url godtas', () => {
  assert.equal(normaliserUrl('http://eksempel.no/event'), 'http://eksempel.no/event');
});

test('whitespace trimmes', () => {
  assert.equal(normaliserUrl('  https://eksempel.no/event  '), 'https://eksempel.no/event');
});

test('ugyldig url (ikke en url i det hele tatt) → null, kaster ikke', () => {
  assert.equal(normaliserUrl('dette er ikke en url'), null);
});

test('ftp-url avvises (kun http/https tillatt)', () => {
  assert.equal(normaliserUrl('ftp://eksempel.no/fil'), null);
});

test('tom streng → null', () => {
  assert.equal(normaliserUrl(''), null);
  assert.equal(normaliserUrl('   '), null);
});

test('null/undefined → null', () => {
  assert.equal(normaliserUrl(null), null);
  assert.equal(normaliserUrl(undefined), null);
});

test('ikke-streng input → null, kaster ikke', () => {
  assert.equal(normaliserUrl(12345), null);
  assert.equal(normaliserUrl({}), null);
});
