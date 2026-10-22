// manuell-event.test.mjs — regresjonstest for POST /api/manuell.
//
// Bug den dekker: etter multi-source-refaktoren (Broadcast/Ticketmaster/
// Tikkio-adaptere) forventer collector/normalize.js et felles
// external-event-format (title/start/venue/pricing/...), men /api/manuell
// bygde fortsatt det gamle Broadcast-spesifikke rå-formatet (name/
// start_time/place/...) før den kalte normaliser(). Resultatet: tittel og
// start ble alltid null, selv når admin fylte dem ut korrekt i skjemaet, og
// endepunktet svarte "Tittel og starttidspunkt er påkrevd".
//
// Spawner den faktiske review/server.js på en dedikert testport mot lokal
// paaby_dev (samme mønster som godkjenn-redigering.test.mjs). ALDRI mot
// produksjon.
//
// Kjør: cd collector && node --test review/tests/manuell-event.test.mjs

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

import pool from '../../../backend/db/pool.mjs';
import { lesCandidates } from '../../store/candidates-db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3915; // egen testport — kolliderer ikke med de andre test-serverne
const BASE = `http://localhost:${PORT}`;
const TEST_EPOST = `manuell-event-test-${crypto.randomUUID()}@example.com`;

let serverProsess;
let cookie;
const opprettedeLegacyIder = [];

before(async () => {
  const hash = await bcrypt.hash('TestPassord1234', 12);
  await pool.query(
    `INSERT INTO admin_users (email, password_hash, role) VALUES ($1, $2, 'admin')`,
    [TEST_EPOST, hash],
  );

  serverProsess = spawn('node', [path.join(__dirname, '../server.js')], {
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

  const loginRes = await fetch(`${BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ epost: TEST_EPOST, passord: 'TestPassord1234' }),
    redirect: 'manual',
  });
  cookie = loginRes.headers.get('set-cookie');
  assert.ok(cookie, 'login skal sette en session-cookie');
});

after(async () => {
  serverProsess?.kill();

  if (opprettedeLegacyIder.length > 0) {
    await pool.query(`DELETE FROM event_candidates WHERE legacy_id = ANY($1)`, [opprettedeLegacyIder]);
  }

  await pool.query(`DELETE FROM admin_users WHERE email = $1`, [TEST_EPOST]);
});


// ─── Hjelpere ───────────────────────────────────────────────────────────────

async function post(sti, body) {
  const res = await fetch(`${BASE}${sti}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Paaby-Admin': '1',
      cookie,
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

async function hentCandidate(legacyId) {
  const alle = await lesCandidates();
  return alle.find((c) => c.id === legacyId) ?? null;
}


// ─── Bug-reproduksjon: tittel + datetime-local start skal faktisk lagres ──

test('POST /api/manuell lagrer manuelt event med korrekt tittel og start', async () => {
  const tittel = `Manuell test ${crypto.randomUUID()}`;

  const { status, data } = await post('/api/manuell', {
    tittel,
    kategori: 'musikk',
    sted: 'Testlokalet',
    adresse: 'Testgata 1, Oslo',
    lat: '59.91',
    lng: '10.75',
    start: '2026-12-15T20:00', // datetime-local — ingen timezone i strengen
    slutt: '',
    pris: '150',
    prisTekst: '',
    beskrivelse: 'En beskrivelse',
    lenke: 'https://example.com/manuell-test',
    bilde: '',
    tags: [],
  });

  assert.equal(status, 200, JSON.stringify(data));
  assert.equal(data.ok, true);
  assert.ok(data.id, 'skal returnere en id for det nye eventet');

  opprettedeLegacyIder.push(data.id);

  const candidate = await hentCandidate(data.id);
  assert.ok(candidate, 'candidaten skal faktisk være lagret i databasen');
  assert.equal(candidate._status, 'pending');
  assert.equal(candidate.tittel, tittel);

  // 20:00 Oslo-lokal tid i desember (vintertid) → +01:00-offset.
  assert.equal(candidate.start, '2026-12-15T20:00:00+01:00');

  assert.equal(candidate.kategori, 'musikk');
});


test('POST /api/manuell beholder valgt kategori (klubb)', async () => {
  const tittel = `Manuell klubb-test ${crypto.randomUUID()}`;

  const { status, data } = await post('/api/manuell', {
    tittel,
    kategori: 'klubb',
    sted: 'Testklubben',
    start: '2026-12-16T23:00',
  });

  assert.equal(status, 200, JSON.stringify(data));
  opprettedeLegacyIder.push(data.id);

  const candidate = await hentCandidate(data.id);
  assert.equal(candidate.kategori, 'klubb');
  assert.equal(candidate.start, '2026-12-16T23:00:00+01:00');
});


test('POST /api/manuell avviser manglende tittel/start (400), lagrer ingenting', async () => {
  const { status, data } = await post('/api/manuell', {
    tittel: '',
    kategori: 'musikk',
    start: '',
  });

  assert.equal(status, 400);
  assert.ok(data.feil);
});
