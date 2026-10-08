// tags.test.mjs — ren logikktest av utledTags() (js/application/tags.js).
// Ingen server, ingen database — bare funksjonen selv.
//
// Kjør: cd collector && node --test review/tests/tags.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { utledTags, erGyldigTag, TILLATTE_TAGS } from '../../../js/application/tags.js';

test('TILLATTE_TAGS har nøyaktig de 17 v1-taggene', () => {
  const slugs = TILLATTE_TAGS.map(([slug]) => slug);
  assert.equal(slugs.length, 17);
  assert.deepEqual(slugs, [
    'free', 'drop-in', 'ticket', 'outdoor', 'indoor',
    'daytime', 'evening', 'late-evening', '18+', '20+',
    'live', 'dj', 'activity', 'market', 'community', 'pop-up', 'festival',
  ]);
});

test('0 tags er lov — ingen tvunget tag uten starttid/pris', () => {
  assert.deepEqual(utledTags([], {}), []);
});

test('én manuelt valgt tag beholdes', () => {
  const resultat = utledTags(['outdoor'], { start: '2026-06-01T12:00:00+02:00' });
  assert.ok(resultat.includes('outdoor'));
  assert.ok(resultat.includes('daytime'));
});

test('flere manuelt valgte tags beholdes sammen med auto-tags', () => {
  const resultat = utledTags(['outdoor', 'live', 'festival'], {
    pris: 0,
    start: '2026-06-01T12:00:00+02:00',
  });
  assert.deepEqual(
    new Set(resultat),
    new Set(['outdoor', 'live', 'festival', 'daytime', 'free']),
  );
});

test('ugyldige tags filtreres bort', () => {
  const resultat = utledTags(['ikke-en-ekte-tag', 'live'], {});
  assert.deepEqual(resultat, ['live']);
});

test('daytime: start før 18:00', () => {
  const resultat = utledTags([], { start: '2026-06-01T17:59:00+02:00' });
  assert.deepEqual(resultat, ['daytime']);
});

test('evening: start 18:00–22:59', () => {
  assert.deepEqual(utledTags([], { start: '2026-06-01T18:00:00+02:00' }), ['evening']);
  assert.deepEqual(utledTags([], { start: '2026-06-01T22:59:00+02:00' }), ['evening']);
});

test('late-evening: start 23:00 eller senere', () => {
  assert.deepEqual(utledTags([], { start: '2026-06-01T23:00:00+01:00' }), ['late-evening']);
  assert.deepEqual(utledTags([], { start: '2026-06-01T23:59:00+01:00' }), ['late-evening']);
});

// Klubbkvelder fortsetter ofte forbi midnatt — 00:00–04:59 regnes som en
// fortsettelse av late-evening, ikke starten på en ny dag.
test('klokketimer rett etter midnatt (00:00–04:59) telles som late-evening', () => {
  assert.deepEqual(utledTags([], { start: '2026-06-01T00:30:00+01:00' }), ['late-evening']);
  assert.deepEqual(utledTags([], { start: '2026-06-01T04:59:00+01:00' }), ['late-evening']);
});

test('05:00 er cutoff — døgnet regnes som nytt igjen (daytime)', () => {
  assert.deepEqual(utledTags([], { start: '2026-06-01T05:00:00+02:00' }), ['daytime']);
});

test('tidstag overstyrer alltid tidligere valgt tidstag (feil verdi fra UI korrigeres)', () => {
  const resultat = utledTags(['late-evening'], { start: '2026-06-01T10:00:00+02:00' });
  assert.deepEqual(resultat, ['daytime']);
});

test('pris = 0 → "free" settes automatisk', () => {
  const resultat = utledTags([], { pris: 0 });
  assert.ok(resultat.includes('free'));
});

test('pris > 0 → "free" fjernes selv om admin hadde satt den manuelt', () => {
  const resultat = utledTags(['free'], { pris: 150 });
  assert.ok(!resultat.includes('free'));
});

test('pris = null (ukjent) → "free" IKKE gjettet, admins manuelle valg respekteres', () => {
  assert.ok(!utledTags([], { pris: null }).includes('free'));
  assert.ok(utledTags(['free'], { pris: null }).includes('free'));
});

test('erGyldigTag', () => {
  assert.equal(erGyldigTag('dj'), true);
  assert.equal(erGyldigTag('ikke-en-tag'), false);
});
