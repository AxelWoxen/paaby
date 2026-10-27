// analytics-api.test.mjs — offentlig first-party analytics-API
// (POST /api/analytics/session|event|saved/sync i backend/server.mjs).
//
// Spawner den faktiske backend/server.mjs på en dedikert testport mot
// lokal paaby_dev (samme mønster som auth.test.mjs/innsikt.test.mjs).
// ALDRI mot produksjon.
//
// Kjør: cd collector && node --test review/tests/analytics-api.test.mjs

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

import pool from '../../../backend/db/pool.mjs';
import { publiserEvent } from '../../store/published.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3913; // egen testport — kolliderer ikke med de andre test-serverne
const BASE = `http://localhost:${PORT}`;

let serverProsess;
const opprettedeVisitorIder = [];
const opprettedeEventIder = [];

before(async () => {
  serverProsess = spawn('node', [path.join(__dirname, '../../../backend/server.mjs')], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'pipe',
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server startet ikke i tide')), 8000);
    serverProsess.stdout.on('data', (data) => {
      if (data.toString().includes('kjører på')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    serverProsess.stderr.on('data', (data) => process.stderr.write(data));
  });
});

after(async () => {
  serverProsess?.kill();

  if (opprettedeVisitorIder.length > 0) {
    await pool.query(`DELETE FROM analytics_saved_events WHERE visitor_id = ANY($1)`, [opprettedeVisitorIder]);
    await pool.query(`DELETE FROM analytics_events WHERE visitor_id = ANY($1)`, [opprettedeVisitorIder]);
    await pool.query(`DELETE FROM analytics_sessions WHERE visitor_id = ANY($1)`, [opprettedeVisitorIder]);
    await pool.query(`DELETE FROM analytics_visitors WHERE visitor_id = ANY($1)`, [opprettedeVisitorIder]);
  }
  if (opprettedeEventIder.length > 0) {
    await pool.query(`DELETE FROM events WHERE id = ANY($1)`, [opprettedeEventIder]);
  }
});

function nyVisitorId() {
  const id = crypto.randomUUID();
  opprettedeVisitorIder.push(id);
  return id;
}

async function post(sti, body) {
  const res = await fetch(`${BASE}${sti}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

async function registrerSesjon(visitorId, sessionId) {
  return post('/api/analytics/session', { visitor_id: visitorId, session_id: sessionId, platform: 'web' });
}


// ─── Validering ─────────────────────────────────────────────────────────────

test('POST /api/analytics/session med ugyldig visitor_id avvises (400)', async () => {
  const { status } = await post('/api/analytics/session', {
    visitor_id: 'ikke-en-uuid',
    session_id: crypto.randomUUID(),
  });
  assert.equal(status, 400);
});

test('POST /api/analytics/event med ukjent event_name avvises (400)', async () => {
  const visitorId = nyVisitorId();
  const sessionId = crypto.randomUUID();
  await registrerSesjon(visitorId, sessionId);

  const { status } = await post('/api/analytics/event', {
    visitor_id: visitorId,
    session_id: sessionId,
    event_name: 'ikke_en_ekte_hendelse',
  });
  assert.equal(status, 400);
});

test('POST /api/analytics/event med ukjent session_id avvises (400, ikke 500)', async () => {
  const visitorId = nyVisitorId();
  const { status } = await post('/api/analytics/event', {
    visitor_id: visitorId,
    session_id: crypto.randomUUID(), // aldri registrert
    event_name: 'kort_åpnet',
  });
  assert.equal(status, 400);
});

test('POST /api/analytics/event med altfor stor payload avvises (400)', async () => {
  const visitorId = nyVisitorId();
  const sessionId = crypto.randomUUID();
  await registrerSesjon(visitorId, sessionId);

  const { status } = await post('/api/analytics/event', {
    visitor_id: visitorId,
    session_id: sessionId,
    event_name: 'kort_åpnet',
    event_id: 'x'.repeat(20_000),
  });
  assert.equal(status, 400);
});

test('POST /api/analytics/saved/sync med event_ids som ikke er en liste avvises (400)', async () => {
  const { status } = await post('/api/analytics/saved/sync', {
    visitor_id: nyVisitorId(),
    event_ids: 'ikke-en-liste',
  });
  assert.equal(status, 400);
});


// ─── Lykkelig sti ───────────────────────────────────────────────────────────

test('Session + event: oppretter visitor/session og logger hendelsen med riktig base_event_id', async () => {
  const visitorId = nyVisitorId();
  const sessionId = crypto.randomUUID();
  const baseEventId = `api-test-${crypto.randomUUID()}`;
  const eventId = `${baseEventId}__2026-03-15`;

  const sesjonRes = await registrerSesjon(visitorId, sessionId);
  assert.equal(sesjonRes.status, 200);

  const { rows: visitorRader } = await pool.query(`SELECT * FROM analytics_visitors WHERE visitor_id = $1`, [visitorId]);
  assert.equal(visitorRader.length, 1);

  const eventRes = await post('/api/analytics/event', {
    visitor_id: visitorId,
    session_id: sessionId,
    event_name: 'kort_åpnet',
    event_id: eventId,
    category: 'musikk',
  });
  assert.equal(eventRes.status, 200);

  const { rows } = await pool.query(
    `SELECT event_name, event_id, base_event_id, category FROM analytics_events WHERE visitor_id = $1`,
    [visitorId],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].event_name, 'kort_åpnet');
  assert.equal(rows[0].event_id, eventId);
  assert.equal(rows[0].base_event_id, baseEventId);
  assert.equal(rows[0].category, 'musikk');
});

test('event_lagret oppretter saved-state, event_fjernet_lagret fjerner den', async () => {
  const visitorId = nyVisitorId();
  const sessionId = crypto.randomUUID();
  const eventId = `api-test-saved-${crypto.randomUUID()}`;
  await registrerSesjon(visitorId, sessionId);

  await post('/api/analytics/event', {
    visitor_id: visitorId, session_id: sessionId, event_name: 'event_lagret', event_id: eventId,
  });
  let { rows } = await pool.query(`SELECT * FROM analytics_saved_events WHERE visitor_id = $1 AND event_id = $2`, [visitorId, eventId]);
  assert.equal(rows.length, 1);

  await post('/api/analytics/event', {
    visitor_id: visitorId, session_id: sessionId, event_name: 'event_fjernet_lagret', event_id: eventId,
  });
  ({ rows } = await pool.query(`SELECT * FROM analytics_saved_events WHERE visitor_id = $1 AND event_id = $2`, [visitorId, eventId]));
  assert.equal(rows.length, 0);
});

test('saved/sync: idempotent — kjøres to ganger uten duplikater eller feil', async () => {
  const visitorId = nyVisitorId();
  const eventIds = [`sync-test-a-${crypto.randomUUID()}`, `sync-test-b-${crypto.randomUUID()}`];

  const forste = await post('/api/analytics/saved/sync', { visitor_id: visitorId, event_ids: eventIds });
  assert.equal(forste.status, 200);
  const andre = await post('/api/analytics/saved/sync', { visitor_id: visitorId, event_ids: eventIds });
  assert.equal(andre.status, 200);

  const { rows } = await pool.query(`SELECT event_id FROM analytics_saved_events WHERE visitor_id = $1 ORDER BY event_id`, [visitorId]);
  assert.deepEqual(rows.map((r) => r.event_id).sort(), [...eventIds].sort());
});

test('filter_valgt: kun properties-nøklene type/verdi beholdes, andre nøkler strippes', async () => {
  const visitorId = nyVisitorId();
  const sessionId = crypto.randomUUID();
  await registrerSesjon(visitorId, sessionId);

  await post('/api/analytics/event', {
    visitor_id: visitorId,
    session_id: sessionId,
    event_name: 'filter_valgt',
    properties: { type: 'kategori', verdi: 'musikk', noe_annet: 'skal-bort' },
  });

  const { rows } = await pool.query(`SELECT properties FROM analytics_events WHERE visitor_id = $1`, [visitorId]);
  assert.deepEqual(rows[0].properties, { type: 'kategori', verdi: 'musikk' });
});


// ─── event_impression ──────────────────────────────────────────────────────

test('event_impression er et gyldig first-party event, og lagres med gyldige surface/position-properties', async () => {
  const visitorId = nyVisitorId();
  const sessionId = crypto.randomUUID();
  await registrerSesjon(visitorId, sessionId);

  const res = await post('/api/analytics/event', {
    visitor_id: visitorId,
    session_id: sessionId,
    event_name: 'event_impression',
    event_id: `impresjon-test-${crypto.randomUUID()}`,
    category: 'musikk',
    properties: { surface: 'utforsk', position: 3 },
  });
  assert.equal(res.status, 200);

  const { rows } = await pool.query(
    `SELECT event_name, properties FROM analytics_events WHERE visitor_id = $1`,
    [visitorId],
  );
  assert.equal(rows[0].event_name, 'event_impression');
  assert.deepEqual(rows[0].properties, { surface: 'utforsk', position: 3 });
});

test('event_impression: ugyldig surface/position strippes (lagres aldri), men selve eventet avvises ikke', async () => {
  const visitorId = nyVisitorId();
  const sessionId = crypto.randomUUID();
  await registrerSesjon(visitorId, sessionId);

  const res = await post('/api/analytics/event', {
    visitor_id: visitorId,
    session_id: sessionId,
    event_name: 'event_impression',
    event_id: `impresjon-test-${crypto.randomUUID()}`,
    properties: { surface: 'ukjent-flate', position: -5, ekstra_felt: 'skal-bort' },
  });
  assert.equal(res.status, 200);

  const { rows } = await pool.query(`SELECT properties FROM analytics_events WHERE visitor_id = $1`, [visitorId]);
  assert.deepEqual(rows[0].properties, {});
});

test('event_impression: filter_valgt sine nøkler (type/verdi) godtas ikke som impression-properties', async () => {
  const visitorId = nyVisitorId();
  const sessionId = crypto.randomUUID();
  await registrerSesjon(visitorId, sessionId);

  await post('/api/analytics/event', {
    visitor_id: visitorId,
    session_id: sessionId,
    event_name: 'event_impression',
    event_id: `impresjon-test-${crypto.randomUUID()}`,
    properties: { type: 'kategori', verdi: 'musikk' },
  });

  const { rows } = await pool.query(`SELECT properties FROM analytics_events WHERE visitor_id = $1`, [visitorId]);
  assert.deepEqual(rows[0].properties, {});
});


// ─── sted_fulgt / sted_avfulgt ──────────────────────────────────────────────

test('sted_fulgt og sted_avfulgt er gyldige first-party events, og lagres med sted+venueId', async () => {
  const visitorId = nyVisitorId();
  const sessionId = crypto.randomUUID();
  await registrerSesjon(visitorId, sessionId);
  const venueId = crypto.randomUUID();

  const fulgtRes = await post('/api/analytics/event', {
    visitor_id: visitorId,
    session_id: sessionId,
    event_name: 'sted_fulgt',
    properties: { sted: 'BLÅ', venueId },
  });
  assert.equal(fulgtRes.status, 200);

  const avfulgtRes = await post('/api/analytics/event', {
    visitor_id: visitorId,
    session_id: sessionId,
    event_name: 'sted_avfulgt',
    properties: { sted: 'BLÅ', venueId },
  });
  assert.equal(avfulgtRes.status, 200);

  const { rows } = await pool.query(
    `SELECT event_name, properties FROM analytics_events WHERE visitor_id = $1 ORDER BY id`,
    [visitorId],
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].event_name, 'sted_fulgt');
  assert.deepEqual(rows[0].properties, { sted: 'BLÅ', venueId });
  assert.equal(rows[1].event_name, 'sted_avfulgt');
  assert.deepEqual(rows[1].properties, { sted: 'BLÅ', venueId });
});

test('sted_fulgt: ugyldig venueId (ikke en UUID) strippes, men sted beholdes', async () => {
  const visitorId = nyVisitorId();
  const sessionId = crypto.randomUUID();
  await registrerSesjon(visitorId, sessionId);

  await post('/api/analytics/event', {
    visitor_id: visitorId,
    session_id: sessionId,
    event_name: 'sted_fulgt',
    properties: { sted: 'Rockefeller', venueId: 'ikke-en-uuid' },
  });

  const { rows } = await pool.query(`SELECT properties FROM analytics_events WHERE visitor_id = $1`, [visitorId]);
  assert.deepEqual(rows[0].properties, { sted: 'Rockefeller' });
});


// ─── Stabile event_uuid/occurrence_uuid ─────────────────────────────────────

async function lagPublisertTestEvent(tittel) {
  const eventId = await publiserEvent({
    id: `analytics-uuid-test-${crypto.randomUUID()}`,
    tittel,
    kategori: 'pafunn',
    sted: 'Analytics-testscenen',
    adresse: 'Testgate 1',
    lat: 59.9, lng: 10.7,
    start: '2026-12-11T20:00:00+01:00',
    slutt: null,
    pris: 100,
    prisTekst: '100 kr',
    beskrivelse: 'Test',
    lenke: `https://eksempel.no/${crypto.randomUUID()}`,
    bilde: null,
    tags: [],
  }, {});
  opprettedeEventIder.push(eventId);
  return eventId;
}

test('stable UUID: kort_åpnet på eventets egen (ikke-gjentakende) forekomst setter BÅDE event_uuid og occurrence_uuid', async () => {
  const eventUuid = await lagPublisertTestEvent('UUID-test ikke-gjentakende');
  const { rows: legacyRad } = await pool.query(`SELECT legacy_id FROM events WHERE id = $1`, [eventUuid]);
  const legacyId = legacyRad[0].legacy_id;
  const { rows: occRad } = await pool.query(`SELECT id FROM event_occurrences WHERE event_id = $1`, [eventUuid]);
  const occurrenceUuid = occRad[0].id;

  const visitorId = nyVisitorId();
  const sessionId = crypto.randomUUID();
  await registrerSesjon(visitorId, sessionId);

  await post('/api/analytics/event', {
    visitor_id: visitorId, session_id: sessionId, event_name: 'kort_åpnet', event_id: legacyId,
  });

  const { rows } = await pool.query(`SELECT event_uuid, occurrence_uuid FROM analytics_events WHERE visitor_id = $1`, [visitorId]);
  assert.equal(rows[0].event_uuid, eventUuid);
  assert.equal(rows[0].occurrence_uuid, occurrenceUuid);
});

test('stable UUID: en syntetisk gjentakelses-forekomst ("__YYYY-MM-DD") setter event_uuid, men IKKE occurrence_uuid', async () => {
  const eventUuid = await lagPublisertTestEvent('UUID-test gjentakende');
  const { rows: legacyRad } = await pool.query(`SELECT legacy_id FROM events WHERE id = $1`, [eventUuid]);
  const legacyId = legacyRad[0].legacy_id;
  const syntetiskEventId = `${legacyId}__2026-12-18`;

  const visitorId = nyVisitorId();
  const sessionId = crypto.randomUUID();
  await registrerSesjon(visitorId, sessionId);

  await post('/api/analytics/event', {
    visitor_id: visitorId, session_id: sessionId, event_name: 'kort_åpnet', event_id: syntetiskEventId,
  });

  const { rows } = await pool.query(`SELECT event_uuid, occurrence_uuid, base_event_id FROM analytics_events WHERE visitor_id = $1`, [visitorId]);
  assert.equal(rows[0].base_event_id, legacyId);
  assert.equal(rows[0].event_uuid, eventUuid);
  assert.equal(rows[0].occurrence_uuid, null);
});

test('stable UUID: ukjent event_id (finnes ikke i events) gir null for begge, krasjer ikke', async () => {
  const visitorId = nyVisitorId();
  const sessionId = crypto.randomUUID();
  await registrerSesjon(visitorId, sessionId);

  const res = await post('/api/analytics/event', {
    visitor_id: visitorId, session_id: sessionId, event_name: 'kort_åpnet', event_id: `finnes-ikke-${crypto.randomUUID()}`,
  });
  assert.equal(res.status, 200);

  const { rows } = await pool.query(`SELECT event_uuid, occurrence_uuid FROM analytics_events WHERE visitor_id = $1`, [visitorId]);
  assert.equal(rows[0].event_uuid, null);
  assert.equal(rows[0].occurrence_uuid, null);
});
