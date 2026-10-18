// sync.test.mjs — ren logikktest av avgjorHandling() og finnEksisterendeMatch()
// (core/sync.js). Ingen database — bare funksjonene selv.
//
// Kjør: cd collector && node --test tests/sync.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avgjorHandling, finnEksisterendeMatch } from '../core/sync.js';

// ─── avgjorHandling ─────────────────────────────────────────────────────────

test('ingen eksisterende ref → NEW', () => {
  assert.equal(avgjorHandling('abc123', null), 'NEW');
});

test('samme hash som lagret ref → UNCHANGED', () => {
  assert.equal(avgjorHandling('abc123', { content_hash: 'abc123' }), 'UNCHANGED');
});

test('annen hash enn lagret ref → CHANGED', () => {
  assert.equal(avgjorHandling('abc999', { content_hash: 'abc123' }), 'CHANGED');
});

// ─── finnEksisterendeMatch ──────────────────────────────────────────────────

function lagPaabyEvent(overrides = {}) {
  return {
    id: 'blaa-testband-2026-11-01',
    tittel: 'Testband',
    sted: 'BLÅ',
    start: '2026-11-01T20:00:00+01:00',
    lenke: 'https://www.ticketmaster.no/event/testband',
    ...overrides,
  };
}

test('samme lenke som en eksisterende candidate → sterkt (url) treff', () => {
  const ny = lagPaabyEvent();
  const eksisterende = [
    { ...lagPaabyEvent({ tittel: 'Testband (annen skrivemåte)' }), _erCandidate: true, _dbId: 'cand-1' },
  ];
  const treff = finnEksisterendeMatch(ny, eksisterende);
  assert.equal(treff.type, 'url');
  assert.equal(treff.match._dbId, 'cand-1');
});

test('ingen lenke-match, men samme tittel+dato+sted → svakt (fuzzy) treff', () => {
  const ny = lagPaabyEvent({ lenke: 'https://ny-lenke.no/event' });
  const eksisterende = [
    { ...lagPaabyEvent({ lenke: 'https://en-helt-annen-lenke.no/x' }), _erCandidate: false, _dbId: 'pub-1' },
  ];
  const treff = finnEksisterendeMatch(ny, eksisterende);
  assert.equal(treff.type, 'fuzzy');
  assert.equal(treff.match._dbId, 'pub-1');
});

test('verken lenke eller tittel+dato+sted matcher → ingen treff', () => {
  const ny = lagPaabyEvent({ lenke: 'https://ny-lenke.no/event' });
  const eksisterende = [
    { ...lagPaabyEvent({ tittel: 'Helt annet band', sted: 'Rockefeller', lenke: 'https://noe-annet.no' }), _erCandidate: true, _dbId: 'cand-2' },
  ];
  assert.equal(finnEksisterendeMatch(ny, eksisterende), null);
});

test('tom eksisterende-liste → ingen treff, kaster ikke', () => {
  assert.equal(finnEksisterendeMatch(lagPaabyEvent(), []), null);
});

test('url-treff prioriteres foran fuzzy-treff når begge finnes', () => {
  const ny = lagPaabyEvent();
  const eksisterende = [
    // fuzzy-kandidat (samme tittel/dato/sted, men annen lenke) står FØRST i lista
    { ...lagPaabyEvent({ lenke: 'https://annen-lenke.no' }), _erCandidate: true, _dbId: 'fuzzy-match' },
    // url-kandidat (samme lenke, men annen tittel) står SIST
    { ...lagPaabyEvent({ tittel: 'Helt annet navn' }), _erCandidate: false, _dbId: 'url-match' },
  ];
  const treff = finnEksisterendeMatch(ny, eksisterende);
  assert.equal(treff.type, 'url');
  assert.equal(treff.match._dbId, 'url-match');
});
