// analyse-identitet.test.mjs — ren logikktest av
// js/application/analyse-identitet.js. Ingen DOM/nettleser nødvendig:
// lagringsfunksjonene tar inn en injisert storage (default er
// window.localStorage, men default-parameteren evalueres aldri her siden
// vi alltid sender inn en falsk storage eksplisitt).
//
// Kjør: cd collector && node --test review/tests/analyse-identitet.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SESJON_TIMEOUT_MS,
  erSesjonUtlopt,
  utledSesjonKontekst,
  hentEllerLagVisitorId,
  hentEllerLagSesjon,
} from '../../../js/application/analyse-identitet.js';

function lagFalskStorage(innhold = {}) {
  const data = { ...innhold };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    _data: data,
  };
}


/* ========================
   erSesjonUtlopt
   ======================== */

test('erSesjonUtlopt: false rett under 30-minuttersgrensen', () => {
  const start = 1_000_000;
  assert.equal(erSesjonUtlopt(start, start + SESJON_TIMEOUT_MS - 1), false);
});

test('erSesjonUtlopt: true rett over 30-minuttersgrensen', () => {
  const start = 1_000_000;
  assert.equal(erSesjonUtlopt(start, start + SESJON_TIMEOUT_MS + 1), true);
});

test('erSesjonUtlopt: manglende/ugyldig tidspunkt regnes som utløpt', () => {
  assert.equal(erSesjonUtlopt(undefined), true);
  assert.equal(erSesjonUtlopt(null), true);
  assert.equal(erSesjonUtlopt(NaN), true);
});


/* ========================
   utledSesjonKontekst
   ======================== */

test('utledSesjonKontekst: plukker ut utm-felter fra søkestreng', () => {
  const ctx = utledSesjonKontekst('?utm_source=instagram&utm_medium=bio&utm_campaign=host', '', 'paaby.no');
  assert.equal(ctx.utmSource, 'instagram');
  assert.equal(ctx.utmMedium, 'bio');
  assert.equal(ctx.utmCampaign, 'host');
});

test('utledSesjonKontekst: manglende utm-felter blir null, ikke tom streng', () => {
  const ctx = utledSesjonKontekst('', '', 'paaby.no');
  assert.equal(ctx.utmSource, null);
  assert.equal(ctx.utmMedium, null);
  assert.equal(ctx.utmCampaign, null);
});

test('utledSesjonKontekst: referrer-vert fra ekstern referrer', () => {
  const ctx = utledSesjonKontekst('', 'https://www.instagram.com/p/xyz', 'paaby.no');
  assert.equal(ctx.referrerHost, 'www.instagram.com');
});

test('utledSesjonKontekst: referrer fra eget domene regnes som "direkte" (null)', () => {
  const ctx = utledSesjonKontekst('', 'https://paaby.no/uke/', 'paaby.no');
  assert.equal(ctx.referrerHost, null);
});

test('utledSesjonKontekst: tom/ugyldig referrer gir null, krasjer ikke', () => {
  assert.equal(utledSesjonKontekst('', '', 'paaby.no').referrerHost, null);
  assert.equal(utledSesjonKontekst('', 'ikke-en-url', 'paaby.no').referrerHost, null);
});


/* ========================
   hentEllerLagVisitorId
   ======================== */

test('hentEllerLagVisitorId: lager og lagrer ny UUID hvis ingen finnes', () => {
  const storage = lagFalskStorage();
  const id = hentEllerLagVisitorId(storage);
  assert.match(id, /^[0-9a-f-]{36}$/i);
  assert.equal(storage.getItem('paaby-analyse-id'), id);
});

test('hentEllerLagVisitorId: gjenbruker eksisterende ID (refresh beholder samme bruker)', () => {
  const storage = lagFalskStorage({ 'paaby-analyse-id': 'fast-id-123' });
  assert.equal(hentEllerLagVisitorId(storage), 'fast-id-123');
  assert.equal(hentEllerLagVisitorId(storage), 'fast-id-123');
});


/* ========================
   hentEllerLagSesjon
   ======================== */

test('hentEllerLagSesjon: starter ny session når ingen finnes', () => {
  const storage = lagFalskStorage();
  const { sessionId, erNy } = hentEllerLagSesjon(storage, 1_000_000);
  assert.match(sessionId, /^[0-9a-f-]{36}$/i);
  assert.equal(erNy, true);
});

test('hentEllerLagSesjon: gjenbruker session innenfor 30 min', () => {
  const storage = lagFalskStorage();
  const start = 1_000_000;
  const forste = hentEllerLagSesjon(storage, start);
  const andre = hentEllerLagSesjon(storage, start + 5000);
  assert.equal(andre.sessionId, forste.sessionId);
  assert.equal(andre.erNy, false);
});

test('hentEllerLagSesjon: roterer til ny session etter >30 min inaktivitet', () => {
  const storage = lagFalskStorage();
  const start = 1_000_000;
  const forste = hentEllerLagSesjon(storage, start);
  const andre = hentEllerLagSesjon(storage, start + SESJON_TIMEOUT_MS + 1);
  assert.notEqual(andre.sessionId, forste.sessionId);
  assert.equal(andre.erNy, true);
});

test('hentEllerLagSesjon: aktivitet innen 30 min forlenger sesjonen fremover (glidende vindu)', () => {
  const storage = lagFalskStorage();
  const start = 1_000_000;
  const forste = hentEllerLagSesjon(storage, start);
  // Aktivitet rett før timeout — forlenger sesjonen
  hentEllerLagSesjon(storage, start + SESJON_TIMEOUT_MS - 1000);
  // Uten forlengelsen ville DENNE vært utløpt (>30 min etter start),
  // men er innenfor 30 min etter forrige touch
  const tredje = hentEllerLagSesjon(storage, start + SESJON_TIMEOUT_MS - 1000 + 5000);
  assert.equal(tredje.sessionId, forste.sessionId);
  assert.equal(tredje.erNy, false);
});
