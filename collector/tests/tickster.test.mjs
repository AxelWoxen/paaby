// tickster.test.mjs — tester adapteren MOT håndlagde fixture-objekter i
// Tickster Event Dump sin BEKREFTEDE, ekte form (se adapters/tickster.js
// filhode for detaljer bekreftet mot det ekte API-et 2026-10-27, med
// TICKSTER_API_KEY fra env, read-only). Ingen ekte API-kall gjøres noe sted
// i denne filen.
//
// Kjør: cd collector && node --test tests/tickster.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mapTicksterEvent,
  hentTicksterEvents,
  erOsloVenue,
  byggFlatListe,
} from '../adapters/tickster.js';
import { normaliser } from '../normalize.js';

const SOURCE = {
  id: 'tickster-oslo',
  adapter: 'tickster',
  tokenEnv: 'TICKSTER_API_KEY',
  languageCode: 'sv',
  apiVersion: '1.0',
  defaultKategori: 'pafunn',
};

// ─── Venue-fixtures — formet som ekte venues fra dumpen (2026-10-27) ───────

const JAEGER = {
  id: '58zlbxh70ebd3g1', name: 'Jæger', address: 'Grensen 9', zipCode: '0159',
  city: 'Oslo', region: 'Oslo', country: 'NO',
  geo: { latitude: 59.914, longitude: 10.7435 },
  infoUri: 'https://www.tickster.com/no/events/at/0/1',
};

const LORENSKOG_ISHALL = {
  id: 'lorenskog-id', name: 'Lørenskog Ishall', address: null, zipCode: '1470',
  city: 'Lørenskog', region: 'Viken', country: 'NO',
  geo: { latitude: 59.9295, longitude: 10.9557 }, // ~11.7 km fra Oslo sentrum
  infoUri: null,
};

const QUALITY_HASLE = {
  // Ekte eksempel på en Oslo-venue UTEN geo i dumpen — fallback må fange denne.
  id: 'hasle-id', name: 'Quality Hotel Hasle Linie', address: null, zipCode: '0581',
  city: 'Oslo', region: 'Oslo', country: 'NO', geo: null, infoUri: null,
};

const MOLDEJAZZ = {
  // NO, men langt fra Oslo med geo — skal IKKE fanges av 25km-regelen.
  id: 'moldejazz-id', name: 'Moldejazz', address: '6413', zipCode: '6413',
  city: 'Molde', region: 'Møre og Romsdal', country: 'NO',
  geo: { latitude: 62.737, longitude: 7.1574 }, infoUri: null,
};

const SVENSK_VENUE = {
  id: 'se-venue', name: 'Konsertsalen i Spira', address: 'Kulturhuset Spira',
  city: 'Jönköping', region: '', country: 'SE',
  geo: { latitude: 57.7776, longitude: 14.1715 }, infoUri: null,
};


// ─── Oslo-filter ────────────────────────────────────────────────────────────

test('erOsloVenue: NO + innenfor ~25km (geo) → true', () => {
  assert.equal(erOsloVenue(JAEGER), true);
  assert.equal(erOsloVenue(LORENSKOG_ISHALL), true); // ~11.7 km, innenfor 25km-regelen (samme prinsipp som Unity Arena/Fornebu for Ticketmaster)
});

test('erOsloVenue: NO + har geo, men UTENFOR 25km → false (fanges ikke av city-fallback når geo faktisk finnes)', () => {
  assert.equal(erOsloVenue(MOLDEJAZZ), false);
});

test('erOsloVenue: NO, mangler geo, city="Oslo" (normalisert) → true (fallback)', () => {
  assert.equal(erOsloVenue(QUALITY_HASLE), true);
  assert.equal(erOsloVenue({ ...QUALITY_HASLE, city: '  OSLO  ' }), true); // normalisering: trim + lowercase
});

test('erOsloVenue: NO, mangler geo, city !== Oslo → false', () => {
  assert.equal(erOsloVenue({ ...QUALITY_HASLE, city: 'Bergen', geo: null }), false);
});

test('erOsloVenue: land !== NO → false uansett geo/by', () => {
  assert.equal(erOsloVenue(SVENSK_VENUE), false);
  assert.equal(erOsloVenue({ ...SVENSK_VENUE, city: 'Oslo' }), false);
});

test('erOsloVenue: manglende venue (null/undefined) → false, kaster ikke', () => {
  assert.equal(erOsloVenue(null), false);
  assert.equal(erOsloVenue(undefined), false);
});


// ─── byggFlatListe — venue-lookup + hierarki ───────────────────────────────

test('byggFlatListe: vanlig event kobles til venue via venueId-oppslag', () => {
  const venueById = new Map([[JAEGER.id, JAEGER]]);
  const event = { id: 'ev1', name: 'Vanlig event', venueId: JAEGER.id, goods: [], childEvents: [] };

  const flat = byggFlatListe([event], venueById);
  assert.equal(flat.length, 1);
  assert.equal(flat[0].venue, JAEGER);
  assert.equal(flat[0].event, event);
});

test('byggFlatListe: isCollectionEvent med childEvents → selve containeren hoppes over, barna flates ut med sin EGEN embeddede venue', () => {
  const barn1 = { id: 'barn-1', name: 'Frædag: Octave One', venue: JAEGER, goods: [] };
  const barn2 = { id: 'barn-2', name: 'Frædag: Einmusik', venue: JAEGER, goods: [] };
  const container = {
    id: 'container-1', name: 'Jæger', isCollectionEvent: true,
    venueId: JAEGER.id, goods: [], childEvents: [barn1, barn2],
  };

  const venueById = new Map([[JAEGER.id, JAEGER]]);
  const flat = byggFlatListe([container], venueById);

  assert.equal(flat.length, 2); // IKKE 3 — containeren selv er ikke med
  assert.deepEqual(flat.map((f) => f.event.id), ['barn-1', 'barn-2']);
  assert.equal(flat[0].venue, JAEGER); // fra barnets EGEN venue-struktur, ikke et venueId-oppslag
});

test('byggFlatListe: isCollectionEvent med TOM childEvents og TOM goods → ren beholder, hoppes helt over', () => {
  const container = {
    id: 'production-1', name: 'Frokost & Lille Lab', isCollectionEvent: true,
    venueId: JAEGER.id, goods: [], childEvents: [],
  };
  const flat = byggFlatListe([container], new Map([[JAEGER.id, JAEGER]]));
  assert.equal(flat.length, 0);
});

test('byggFlatListe: isCollectionEvent med TOM childEvents, men EGNE goods → behandles som vanlig event (ikke hoppet over)', () => {
  // Observert i ekte data: noen collection-flaggede rader er likevel reelt
  // bookbare i seg selv (f.eks. "Sabaton - Linköping": isCollectionEvent,
  // 0 childEvents, 2 goods).
  const sellableCollection = {
    id: 'sabaton-like', name: 'Reelt bookbart, men flagget collection', isCollectionEvent: true,
    venueId: JAEGER.id, goods: [{ type: 'ticket', stockStatus: 'InStock', price: { includingVat: '500', currency: 'NOK' } }],
    childEvents: [],
  };
  const flat = byggFlatListe([sellableCollection], new Map([[JAEGER.id, JAEGER]]));
  assert.equal(flat.length, 1);
  assert.equal(flat[0].event.id, 'sabaton-like');
});

test('byggFlatListe: event utenfor Oslo (etter venue-oppslag) filtreres ut i selve adapter-flyten', () => {
  // Egen test av selve filtreringslaget (ikke bare erOsloVenue) — simulerer
  // hva hentTicksterEvents() faktisk gjør etter byggFlatListe().
  const moldeEvent  = { id: 'molde-1', name: 'Moldejazz-konsert', venueId: MOLDEJAZZ.id, goods: [], childEvents: [] };
  const osloEvent    = { id: 'oslo-1', name: 'Jæger-kveld', venueId: JAEGER.id, goods: [], childEvents: [] };
  const venueById = new Map([[MOLDEJAZZ.id, MOLDEJAZZ], [JAEGER.id, JAEGER]]);

  const flat = byggFlatListe([moldeEvent, osloEvent], venueById);
  const osloFiltrert = flat.filter(({ venue }) => erOsloVenue(venue));

  assert.equal(osloFiltrert.length, 1);
  assert.equal(osloFiltrert[0].event.id, 'oslo-1');
});


// ─── mapTicksterEvent ───────────────────────────────────────────────────────

const FIXTURE_EVENT = {
  id: 'y5taaarff8ng2jl',
  published: true,
  name: 'KURS: Impro Basic 1',
  start: '2026-09-07T19:00:00+02:00',
  end: '2026-11-16T19:00:00+01:00',
  lastUpdated: '2026-09-29T09:41:00+02:00',
  hierarchyType: 'production-child',
  productionParentId: 'L0RXTG4J8A36X7C',
  doorsOpen: '2026-09-07T19:00:00+02:00',
  infoUri: 'https://www.tickster.com/no/nb/events/y5taaarff8ng2jl/2026-09-07/kurs-impro-basic-1',
  shopUri: 'https://billett.detandreteatret.no/y5taaarff8ng2jl',
  eventState: 'ReleasedForSale',
  description: '<p>Dette er en innføring for nybegynnere.</p>',
  imageUrl: 'https://static.tickster.com/62/d56a85bde2c9240db5403bf2bf36487971a045',
  isCollectionEvent: false,
  tags: ['improkurs', 'detandreteatret'],
  performers: [],
  links: [],
  goods: [
    { name: 'Ordinær', type: 'ticket', stockStatus: 'InStock', price: { includingVat: '3000', vatPercentage: '0', currency: 'NOK' } },
  ],
  venueId: JAEGER.id,
};

test('mapper et fullstendig Tickster-event til felles external-event-form', () => {
  const external = mapTicksterEvent(FIXTURE_EVENT, JAEGER, SOURCE);

  assert.equal(external.provider, 'tickster');
  assert.equal(external.externalId, 'y5taaarff8ng2jl');
  assert.equal(external.sourceUrl, FIXTURE_EVENT.infoUri);
  assert.equal(external.sourceStatus, 'scheduled');
  assert.equal(external.sourceUpdatedAt, '2026-09-29T09:41:00+02:00');
  assert.equal(external.title, 'KURS: Impro Basic 1');
  assert.equal(external.start, '2026-09-07T19:00:00+02:00');
  assert.equal(external.end, '2026-11-16T19:00:00+01:00');
  assert.equal(external.description, 'Dette er en innføring for nybegynnere.'); // HTML strippet
  assert.equal(external.venue.name, 'Jæger');
  assert.equal(external.venue.address, 'Grensen 9');
  assert.equal(external.venue.latitude, 59.914);
  assert.equal(external.venue.longitude, 10.7435);
  assert.equal(external.pricing.min, 3000);
  assert.equal(external.pricing.currency, 'NOK');
  assert.equal(external.imageUrl, FIXTURE_EVENT.imageUrl);
  assert.equal(external.defaultCategory, 'pafunn');
});

test('externalId settes alltid fra Tickster sin egen event.id (som streng)', () => {
  const external = mapTicksterEvent({ ...FIXTURE_EVENT, id: 123456 }, JAEGER, SOURCE);
  assert.equal(external.externalId, '123456');
  assert.equal(typeof external.externalId, 'string');
});

test('eventState "Cancelled" → sourceStatus cancelled', () => {
  const event = { ...FIXTURE_EVENT, eventState: 'Cancelled' };
  assert.equal(mapTicksterEvent(event, JAEGER, SOURCE).sourceStatus, 'cancelled');
});

test('minimumspris: velger laveste pris blant ticket-goods, ignorerer seasonoffer', () => {
  const event = {
    ...FIXTURE_EVENT,
    goods: [
      { type: 'seasonoffer', stockStatus: 'Undefined', price: { includingVat: '50', currency: 'NOK' } }, // skal IKKE telle
      { type: 'ticket', stockStatus: 'InStock', price: { includingVat: '450', currency: 'NOK' } },
      { type: 'ticket', stockStatus: 'InStock', price: { includingVat: '250', currency: 'NOK' } },
    ],
  };
  const external = mapTicksterEvent(event, JAEGER, SOURCE);
  assert.equal(external.pricing.min, 250);
});

test('minimumspris: SoldOut-billetter utelates fra minimumsberegningen når en billigere, tilgjengelig billett finnes', () => {
  const event = {
    ...FIXTURE_EVENT,
    goods: [
      { type: 'ticket', stockStatus: 'SoldOut', price: { includingVat: '100', currency: 'NOK' } }, // billigst, men utsolgt
      { type: 'ticket', stockStatus: 'InStock', price: { includingVat: '350', currency: 'NOK' } },
    ],
  };
  assert.equal(mapTicksterEvent(event, JAEGER, SOURCE).pricing.min, 350);
});

test('minimumspris: pris 0 behandles som gratis (0), ikke null', () => {
  const event = { ...FIXTURE_EVENT, goods: [{ type: 'ticket', stockStatus: 'InStock', price: { includingVat: '0', currency: 'NOK' } }] };
  assert.equal(mapTicksterEvent(event, JAEGER, SOURCE).pricing.min, 0);
});

test('manglende goods (tom liste) → pris null, krasjer ikke', () => {
  const event = { ...FIXTURE_EVENT, goods: [] };
  const external = mapTicksterEvent(event, JAEGER, SOURCE);
  assert.equal(external.pricing.min, null);
});

test('goods uten noen type==="ticket" (kun seasonoffer) → pris null', () => {
  const event = { ...FIXTURE_EVENT, goods: [{ type: 'seasonoffer', stockStatus: 'Undefined', price: { includingVat: '1300', currency: 'NOK' } }] };
  assert.equal(mapTicksterEvent(event, JAEGER, SOURCE).pricing.min, null);
});

test('uparserbar pris (ikke-numerisk streng) ignoreres, faller ikke tilbake til NaN', () => {
  const event = { ...FIXTURE_EVENT, goods: [{ type: 'ticket', stockStatus: 'InStock', price: { includingVat: 'ikke-et-tall', currency: 'NOK' } }] };
  const external = mapTicksterEvent(event, JAEGER, SOURCE);
  assert.equal(external.pricing.min, null);
  assert.equal(Number.isNaN(external.pricing.min), false);
});

test('manglende description/imageUrl/end/venue-geo → null-felt, kaster ikke', () => {
  const minimalt = { id: 'min-1', name: 'Minimalt event', eventState: null, goods: [] };
  const external = mapTicksterEvent(minimalt, null, SOURCE);
  assert.equal(external.description, null);
  assert.equal(external.imageUrl, null);
  assert.equal(external.end, null);
  assert.equal(external.venue.name, null);
  assert.equal(external.venue.latitude, null);
  assert.equal(external.pricing.min, null);
  assert.equal(external.sourceStatus, 'unknown');
});

test('ukjente/nye JSON-properties i rå-eventet ignoreres, krasjer ikke', () => {
  const event = {
    ...FIXTURE_EVENT,
    heltNyttFeltTicksterLeggerTilSenere: { noe: 'ukjent', dypt: { nestet: true } },
    enAnnenNyProperty: [1, 2, 3],
  };
  assert.doesNotThrow(() => mapTicksterEvent(event, JAEGER, SOURCE));
  const external = mapTicksterEvent(event, JAEGER, SOURCE);
  assert.equal(external.title, 'KURS: Impro Basic 1'); // uendret, resten av mappingen påvirkes ikke
});

test('kategori-hint: nightlife/house/techno-tags → "club"-hint, lander på klubb via normalize.js', () => {
  const event = { ...FIXTURE_EVENT, tags: ['house', 'rave'] };
  const external = mapTicksterEvent(event, JAEGER, SOURCE);
  assert.ok(external.categoryHints.includes('club'));
  assert.equal(normaliser(external).kategori, 'klubb');
});

test('kategori-hint: teater/impro/humor-tags → "other"-hint, lander på pafunn', () => {
  const event = { ...FIXTURE_EVENT, tags: ['improkurs', 'teater'] };
  const external = mapTicksterEvent(event, JAEGER, SOURCE);
  assert.deepEqual(external.categoryHints, ['other']);
  assert.equal(normaliser(external).kategori, 'pafunn');
});

test('kategori-hint: konsert/jazz-tags → "concert"-hint, lander på musikk', () => {
  const event = { ...FIXTURE_EVENT, tags: ['jazz', 'konsert'] };
  const external = mapTicksterEvent(event, JAEGER, SOURCE);
  assert.ok(external.categoryHints.includes('concert'));
  assert.equal(normaliser(external).kategori, 'musikk');
});

test('kategori-hint: ukjente tags → ingen hint, faller tilbake til source sin defaultKategori', () => {
  const event = { ...FIXTURE_EVENT, tags: ['helt-ukjent-tag-123'] };
  const external = mapTicksterEvent(event, JAEGER, SOURCE);
  assert.deepEqual(external.categoryHints, []);
  assert.equal(normaliser(external).kategori, 'pafunn'); // SOURCE.defaultKategori
});


// ─── hentTicksterEvents — API-key, URL-oppbygging, ende-til-ende-filter ────

test('manglende TICKSTER_API_KEY → tydelig feil, ingen nettverkskall', async () => {
  const opprinnelig = process.env.TICKSTER_API_KEY;
  delete process.env.TICKSTER_API_KEY;

  const originalFetch = global.fetch;
  let kaltNoenGang = false;
  global.fetch = async () => { kaltNoenGang = true; throw new Error('skal ikke kalles'); };

  try {
    await assert.rejects(() => hentTicksterEvents(SOURCE), /TICKSTER_API_KEY/);
    assert.equal(kaltNoenGang, false);
  } finally {
    global.fetch = originalFetch;
    if (opprinnelig !== undefined) process.env.TICKSTER_API_KEY = opprinnelig;
  }
});

test('metadata-endepunktet kalles med bekreftet language-code "sv" og api-version "1.0"', async () => {
  const opprinnelig = process.env.TICKSTER_API_KEY;
  process.env.TICKSTER_API_KEY = 'test-nøkkel';

  const originalFetch = global.fetch;
  let metadataUrl = null;
  global.fetch = async (url) => {
    if (String(url).includes('/events/dump/upcoming')) {
      metadataUrl = url;
      return { ok: true, json: async () => ({ id: 'dump-1', created: '2026-10-27', eTag: 'x', uri: 'https://dump.example/data' }) };
    }
    return { ok: true, json: async () => ({ count: 0, created: '2026-10-27', events: [], venues: [], organizers: [] }) };
  };

  try {
    await hentTicksterEvents(SOURCE);
    assert.match(String(metadataUrl), /^https:\/\/api\.tickster\.com\/sv\/api\/1\.0\/events\/dump\/upcoming\?key=/);
  } finally {
    global.fetch = originalFetch;
    if (opprinnelig !== undefined) process.env.TICKSTER_API_KEY = opprinnelig;
    else delete process.env.TICKSTER_API_KEY;
  }
});

test('ende-til-ende: henter dump, filtrerer til Oslo, mapper til external-event-form', async () => {
  const opprinnelig = process.env.TICKSTER_API_KEY;
  process.env.TICKSTER_API_KEY = 'test-nøkkel';

  const dump = {
    count: 2,
    created: '2026-10-27',
    events: [
      { id: 'oslo-ev', name: 'Oslo-event', venueId: JAEGER.id, start: '2026-11-01T20:00:00+01:00', eventState: 'ReleasedForSale', goods: [], childEvents: [], tags: [] },
      { id: 'molde-ev', name: 'Molde-event', venueId: MOLDEJAZZ.id, start: '2026-11-02T20:00:00+01:00', eventState: 'ReleasedForSale', goods: [], childEvents: [], tags: [] },
    ],
    venues: [JAEGER, MOLDEJAZZ],
    organizers: [],
  };

  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes('/events/dump/upcoming')) {
      return { ok: true, json: async () => ({ id: 'dump-1', created: '2026-10-27', eTag: 'x', uri: 'https://dump.example/data' }) };
    }
    return { ok: true, json: async () => dump };
  };

  try {
    const resultat = await hentTicksterEvents(SOURCE);
    assert.equal(resultat.length, 1);
    assert.equal(resultat[0].externalId, 'oslo-ev');
    assert.equal(resultat[0].provider, 'tickster');
  } finally {
    global.fetch = originalFetch;
    if (opprinnelig !== undefined) process.env.TICKSTER_API_KEY = opprinnelig;
    else delete process.env.TICKSTER_API_KEY;
  }
});
