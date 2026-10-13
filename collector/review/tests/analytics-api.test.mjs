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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3913; // egen testport — kolliderer ikke med de andre test-serverne
const BASE = `http://localhost:${PORT}`;

let serverProsess;
const opprettedeVisitorIder = [];

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
