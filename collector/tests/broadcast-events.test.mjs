// broadcast-events.test.mjs — dekker test 1 fra refaktoreringsplanen:
// Broadcast rå-data → adapter/common-format → påby-candidate → samme
// relevante data som før refaktoreringen. Ren logikk, ingen nett/DB.
//
// VASSENDGUTANE_FIXTURE er et ekte (offentlig) rå-objekt hentet fra
// broadcast.events-API-et for Sentrum Scene (collector/.cache/, gitignored)
// — limt inn her slik at regresjonstesten ikke er avhengig av en lokal
// cache-fil som finnes.
//
// Kjør: cd collector && node --test tests/broadcast-events.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapBroadcastEvent } from '../adapters/broadcast-events.js';
import { normaliser } from '../normalize.js';

const SENTRUM_SCENE_SOURCE = {
  id: 'rockefeller',
  adapter: 'broadcast-events',
  url: 'https://www.rockefeller.no',
  venueId: 'DOtnIChxc7',
  defaultKategori: 'musikk',
  sted: 'Rockefeller / Sentrum Scene',
  adresse: 'Arbeidersamfunnets plass 1, 0181 Oslo',
  lat: 59.91552,
  lng: 10.7518,
};

const VASSENDGUTANE_FIXTURE = {
  id: 'lJAv8s0FKR',
  name: 'Vassendgutane',
  start_time: '2026-10-09T17:00:00.000Z',
  tags: ['country', 'festmusikk'],
  tagsFlattened: '#country #festmusikk ',
  details: 'Vassendgutane har lenge vært kjent som «originalen av festcountry» …',
  custom_fields: {
    end_time: '2026-10-09T21:00:00.000Z',
    cover: 'NOK 580 + avg.',
    type: 'Concert',
    ticketUrl: 'https://www.ticketmaster.no/event/vassendgutane-billetter/2064433914',
    freeEntry: false,
    moreInfo: '',
    eventStatus: 'LIMITED',
  },
  place: {
    name: 'Sentrum Scene',
    address: 'Arbeidersamfunnets plass 1',
    city: 'Oslo',
    postal_code: '0181',
    latitude: 59.91552,
    longitude: 10.7518,
  },
  imagekit: { url: 'https://ik.imagekit.io/mfgbmrqfuvo/venues/event_HPAq9z7AmT' },
  photo: { urls: { large: 'https://ik.imagekit.io/mfgbmrqfuvo/venues/event_HPAq9z7AmT/tr:w-750' } },
  updatedAt: '2026-09-28T10:36:11.245Z',
};

test('ekte Broadcast-event → adapter → normalize gir samme relevante felt som før', () => {
  const external = mapBroadcastEvent(VASSENDGUTANE_FIXTURE, SENTRUM_SCENE_SOURCE);
  const event = normaliser(external);

  assert.equal(event.tittel, 'Vassendgutane');
  assert.equal(event.kategori, 'musikk'); // Concert, ingen dj/electronic-tag
  assert.equal(event.sted, 'Sentrum Scene'); // fra place.name, ikke source.sted
  assert.equal(event.adresse, 'Arbeidersamfunnets plass 1, 0181, Oslo');
  assert.equal(event.lat, 59.91552);
  assert.equal(event.lng, 10.7518);
  assert.equal(event.start, '2026-10-09T19:00:00+02:00'); // UTC 17:00 → Oslo sommertid +02:00
  assert.equal(event.slutt, '2026-10-09T23:00:00+02:00');
  assert.equal(event.pris, 580);
  assert.equal(event.prisTekst, '580 kr');
  assert.equal(event.lenke, 'https://www.ticketmaster.no/event/vassendgutane-billetter/2064433914');
  assert.equal(event.bilde, 'https://ik.imagekit.io/mfgbmrqfuvo/venues/event_HPAq9z7AmT/tr:w-750');
  assert.ok(event.beskrivelse.startsWith('Vassendgutane har lenge'));
  assert.equal(event.id, 'sentrum-scene-vassendgutane-2026-10-09');

  // Kildeidentitet — det nye laget, skal følge med fra adapteren
  assert.equal(external.provider, 'broadcast-events');
  assert.equal(external.externalId, 'lJAv8s0FKR');
  assert.equal(external.sourceStatus, 'scheduled');
  assert.equal(external.sourceUpdatedAt, '2026-09-28T10:36:11.245Z');
});

test('club-type → klubb', () => {
  const råEvent = { ...VASSENDGUTANE_FIXTURE, custom_fields: { ...VASSENDGUTANE_FIXTURE.custom_fields, type: 'Club' }, tagsFlattened: 'house disco' };
  const event = normaliser(mapBroadcastEvent(råEvent, SENTRUM_SCENE_SOURCE));
  assert.equal(event.kategori, 'klubb');
});

test('concert-type med dj/electronic-tag → klubb, ikke musikk', () => {
  const råEvent = { ...VASSENDGUTANE_FIXTURE, tagsFlattened: 'dj electronic' };
  const event = normaliser(mapBroadcastEvent(råEvent, SENTRUM_SCENE_SOURCE));
  assert.equal(event.kategori, 'klubb');
});

test('food-tag → pafunn', () => {
  const råEvent = { ...VASSENDGUTANE_FIXTURE, custom_fields: { ...VASSENDGUTANE_FIXTURE.custom_fields, type: 'Food' } };
  const event = normaliser(mapBroadcastEvent(råEvent, SENTRUM_SCENE_SOURCE));
  assert.equal(event.kategori, 'pafunn');
});

test('ukjent type uten hint → defaultKategori fra source', () => {
  const råEvent = { ...VASSENDGUTANE_FIXTURE, custom_fields: { ...VASSENDGUTANE_FIXTURE.custom_fields, type: 'Quiz' }, tagsFlattened: '' };
  const event = normaliser(mapBroadcastEvent(råEvent, { ...SENTRUM_SCENE_SOURCE, defaultKategori: 'pafunn' }));
  assert.equal(event.kategori, 'pafunn');
});

test('freeEntry → pris 0 og prisTekst "Gratis"', () => {
  const råEvent = { ...VASSENDGUTANE_FIXTURE, custom_fields: { ...VASSENDGUTANE_FIXTURE.custom_fields, freeEntry: true, cover: '' } };
  const event = normaliser(mapBroadcastEvent(råEvent, SENTRUM_SCENE_SOURCE));
  assert.equal(event.pris, 0);
  assert.equal(event.prisTekst, 'Gratis');
});

test('manglende place → faller tilbake til source sine fallback-verdier', () => {
  const råEvent = { ...VASSENDGUTANE_FIXTURE, place: undefined };
  const event = normaliser(mapBroadcastEvent(råEvent, SENTRUM_SCENE_SOURCE));
  assert.equal(event.sted, 'Rockefeller / Sentrum Scene');
  assert.equal(event.adresse, 'Arbeidersamfunnets plass 1, 0181 Oslo');
  assert.equal(event.lat, 59.91552);
});

test('verken ticketUrl eller moreInfo → faller tilbake til venue-forsiden', () => {
  const råEvent = { ...VASSENDGUTANE_FIXTURE, custom_fields: { ...VASSENDGUTANE_FIXTURE.custom_fields, ticketUrl: '', moreInfo: '' } };
  const event = normaliser(mapBroadcastEvent(råEvent, SENTRUM_SCENE_SOURCE));
  assert.equal(event.lenke, 'https://www.rockefeller.no');
});

test('ødelagt/ugyldig ticketUrl → lenke blir null, resten av eventet beholdes', () => {
  // Regresjonstest for "en ugyldig valgfri URL skal ikke kunne velte hele eventet".
  const råEvent = {
    ...VASSENDGUTANE_FIXTURE,
    custom_fields: { ...VASSENDGUTANE_FIXTURE.custom_fields, ticketUrl: 'ikke en gyldig url', moreInfo: '' },
  };
  const source = { ...SENTRUM_SCENE_SOURCE, url: undefined };
  const event = normaliser(mapBroadcastEvent(råEvent, source));
  assert.equal(event.lenke, null);
  assert.equal(event.tittel, 'Vassendgutane'); // resten av eventet er intakt
});

test('manglende tittel eller starttid droppes av normaliserAlle (regresjon)', async () => {
  const { normaliserAlle } = await import('../normalize.js');
  const utenTittel = mapBroadcastEvent({ ...VASSENDGUTANE_FIXTURE, name: '' }, SENTRUM_SCENE_SOURCE);
  const utenStart  = mapBroadcastEvent({ ...VASSENDGUTANE_FIXTURE, start_time: null }, SENTRUM_SCENE_SOURCE);
  const gyldig      = mapBroadcastEvent(VASSENDGUTANE_FIXTURE, SENTRUM_SCENE_SOURCE);

  const resultat = normaliserAlle([utenTittel, utenStart, gyldig]);
  assert.equal(resultat.length, 1);
  assert.equal(resultat[0].tittel, 'Vassendgutane');
});
