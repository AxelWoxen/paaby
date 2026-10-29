// analytics-events.test.mjs — ren logikktest av js/application/analytics-events.js.
// Ingen server, ingen database — bare funksjonene selv (samme mønster som
// tags.test.mjs).
//
// Kjør: cd collector && node --test review/tests/analytics-events.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ANALYTICS_EVENT_NAVN,
  erGyldigAnalyticsEventNavn,
  erGyldigSurface,
  erGyldigSortering,
  RANGERINGS_VERSJON,
  utledBaseEventId,
} from '../../../js/application/analytics-events.js';

test('ANALYTICS_EVENT_NAVN har nøyaktig de 12 definerte hendelsene', () => {
  assert.deepEqual(ANALYTICS_EVENT_NAVN, [
    'kort_åpnet',
    'event_lagret',
    'event_fjernet_lagret',
    'mer_info_klikket',
    'event_delt',
    'filter_valgt',
    'uke_neste',
    'avstand_aktivert',
    'event_impression',
    'sted_fulgt',
    'sted_avfulgt',
    'kort_lukket',
  ]);
});

test('erGyldigAnalyticsEventNavn godtar event_impression/sted_fulgt/sted_avfulgt', () => {
  assert.equal(erGyldigAnalyticsEventNavn('event_impression'), true);
  assert.equal(erGyldigAnalyticsEventNavn('sted_fulgt'), true);
  assert.equal(erGyldigAnalyticsEventNavn('sted_avfulgt'), true);
});

test('erGyldigSurface godtar kun de fire kjente produktflatene', () => {
  assert.equal(erGyldigSurface('forside'), true);
  assert.equal(erGyldigSurface('utforsk'), true);
  assert.equal(erGyldigSurface('lagret'), true);
  assert.equal(erGyldigSurface('følger'), true);
  assert.equal(erGyldigSurface('ukjent-flate'), false);
  assert.equal(erGyldigSurface(''), false);
  assert.equal(erGyldigSurface(null), false);
});

test('erGyldigSortering godtar kun sorteringsvalgene sortering.js kjenner', () => {
  assert.equal(erGyldigSortering('tid-stigende'), true);
  assert.equal(erGyldigSortering('avstand-synkende'), true);
  assert.equal(erGyldigSortering('popularitet'), false);
  assert.equal(erGyldigSortering(''), false);
  assert.equal(erGyldigSortering(null), false);
});

test('RANGERINGS_VERSJON er en kort slug backend-valideringen godtar', () => {
  assert.match(RANGERINGS_VERSJON, /^[a-z0-9][a-z0-9.-]{0,39}$/);
});

test('erGyldigAnalyticsEventNavn godtar alle listede navn', () => {
  for (const navn of ANALYTICS_EVENT_NAVN) {
    assert.equal(erGyldigAnalyticsEventNavn(navn), true);
  }
});

test('erGyldigAnalyticsEventNavn avviser ukjente/ugyldige navn', () => {
  assert.equal(erGyldigAnalyticsEventNavn('ukjent_event'), false);
  assert.equal(erGyldigAnalyticsEventNavn(''), false);
  assert.equal(erGyldigAnalyticsEventNavn(null), false);
  assert.equal(erGyldigAnalyticsEventNavn(undefined), false);
  assert.equal(erGyldigAnalyticsEventNavn(123), false);
});

test('utledBaseEventId: occurrence-ID gir base-ID', () => {
  assert.equal(
    utledBaseEventId('frank-znort-blaa-2026-07-19__2026-07-19'),
    'frank-znort-blaa-2026-07-19',
  );
});

test('utledBaseEventId: base-ID-en kan selv inneholde en dato (slugifisert tittel)', () => {
  // Grunn-ID-en fra collector/normalize.js inneholder ofte eventets EGEN
  // dato i slug-en — "__" (dobbel understreking) er det eneste entydige
  // skilletegnet mot occurrence-suffikset, IKKE bare "finnes det et
  // dato-mønster et sted i strengen".
  assert.equal(
    utledBaseEventId('harlem-bar-ferske-fjes-2026-08-11__2026-10-13'),
    'harlem-bar-ferske-fjes-2026-08-11',
  );
});

test('utledBaseEventId: engangsevent (ingen "__") returneres uendret', () => {
  assert.equal(utledBaseEventId('bla-fangst-2026-11-27'), 'bla-fangst-2026-11-27');
});

test('utledBaseEventId: "__" uten gyldig dato etterpå returneres uendret', () => {
  assert.equal(utledBaseEventId('noe__ikke-en-dato'), 'noe__ikke-en-dato');
  assert.equal(utledBaseEventId('noe__2026-13-99'), 'noe__2026-13-99'); // ugyldig måned/dag
});

test('utledBaseEventId: tomt/ugyldig input gir null', () => {
  assert.equal(utledBaseEventId(''), null);
  assert.equal(utledBaseEventId(null), null);
  assert.equal(utledBaseEventId(undefined), null);
});

test('utledBaseEventId: flere "__" i strengen matcher likevel riktig base (grådig prefiks)', () => {
  assert.equal(utledBaseEventId('a__b__2026-01-01'), 'a__b');
});
