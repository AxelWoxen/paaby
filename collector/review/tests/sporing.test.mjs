// sporing.test.mjs — ren logikktest av js/application/sporing.js sitt
// samtykke-gatede trackEvent(). Dette er den faktiske mekanismen som gjør
// at "samtykke = nei" ALDRI oppretter en analytics-identity (ingen sink
// kalles, altså kalles aldri js/main.js sin analyseSink() →
// hentEllerLagVisitorId()), og at tilbaketrekking faktisk stopper videre
// sporing umiddelbart.
//
// sporingsAktivert er MODUL-state delt mellom testene i denne filen —
// testene er derfor skrevet i bevisst rekkefølge, ikke isolert.
//
// Kjør: cd collector && node --test review/tests/sporing.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aktiverSporing, deaktiverSporing, trackEvent, registrerAnalyseSink } from '../../../js/application/sporing.js';

const mottatt = [];
registrerAnalyseSink((navn, data) => mottatt.push({ navn, data }));

test('trackEvent FØR samtykke (aktiverSporing aldri kalt): ingen sink mottar noe — ingen analytics-identity opprettes', () => {
  trackEvent('kort_åpnet', { id: 'test-1' });
  assert.equal(mottatt.length, 0);
});

test('trackEvent ETTER aktiverSporing(): registrerte sinks mottar hendelsen', () => {
  aktiverSporing();
  trackEvent('kort_åpnet', { id: 'test-2' });
  assert.equal(mottatt.length, 1);
  assert.equal(mottatt[0].navn, 'kort_åpnet');
  assert.deepEqual(mottatt[0].data, { id: 'test-2' });
});

test('trackEvent ETTER deaktiverSporing() (tilbaketrekking): sinks mottar IKKE flere hendelser', () => {
  deaktiverSporing();
  trackEvent('kort_åpnet', { id: 'test-3' });
  assert.equal(mottatt.length, 1); // fortsatt kun hendelsen fra forrige test
});

test('aktiverSporing() igjen etter en tidligere deaktivering fungerer (gjenoppta samtykke)', () => {
  aktiverSporing();
  trackEvent('kort_åpnet', { id: 'test-4' });
  assert.equal(mottatt.length, 2);
});
