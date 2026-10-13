// innsikt.test.mjs — «Innsikt»-fanen (review/insight.js + GET /api/innsikt).
//
// To deler:
// 1. Auth-gate: spawner den faktiske review/server.js på en dedikert
//    testport mot lokal paaby_dev (samme mønster som auth.test.mjs),
//    bekrefter at /api/innsikt krever innlogging akkurat som resten av
//    panelet.
// 2. Aggregeringsmatte: kaller hentInnsikt() direkte (ingen server
//    nødvendig) mot kjente, selv-opprettede fixture-rader i paaby_dev, og
//    verifiserer KPI/funnel/retention-tall. Måler DELTA mot en baseline tatt
//    før fixturene settes inn, slik at testen er robust selv om andre rader
//    skulle finnes i tabellene fra før.
//
// Kjør: cd collector && node --test review/tests/innsikt.test.mjs
// ALDRI mot produksjon — kun lokal paaby_dev (DATABASE_URL i .env).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

import pool from '../../../backend/db/pool.mjs';
import { hentInnsikt } from '../insight.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));


// ─── Del 1: auth-gate (spawnet server) ─────────────────────────────────────

const PORT = 3912; // egen testport — kolliderer ikke med auth.test.mjs (3911) eller npm run review (3001)
const BASE = `http://localhost:${PORT}`;
const TEST_EPOST = `innsikt-auth-test-${crypto.randomUUID()}@example.com`;

let serverProsess;

before(async () => {
  // Egen testbruker for login-sjekken under — ryddes bort i after().
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
});

after(async () => {
  serverProsess?.kill();
  await pool.query(`DELETE FROM admin_users WHERE email = $1`, [TEST_EPOST]);
});

test('GET /api/innsikt uten sesjon krever innlogging (401)', async () => {
  const res = await fetch(`${BASE}/api/innsikt?periode=7`);
  assert.equal(res.status, 401);
});

test('GET /api/innsikt med gyldig sesjon returnerer forventet form', async () => {
  const loginRes = await fetch(`${BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ epost: TEST_EPOST, passord: 'TestPassord1234' }),
    redirect: 'manual',
  });
  const cookie = loginRes.headers.get('set-cookie');
  assert.ok(cookie, 'login skal sette en session-cookie');

  const res = await fetch(`${BASE}/api/innsikt?periode=30`, {
    headers: { cookie },
  });
  assert.equal(res.status, 200);

  const data = await res.json();
  assert.equal(data.periode.valgt, '30');
  assert.ok('unikeBrukere' in data.summary);
  assert.ok(Array.isArray(data.funnel));
  assert.ok(Array.isArray(data.timeseries));
  assert.ok(Array.isArray(data.topEvents));
  assert.ok('firstAnalyticsEventAt' in data.metadata);
});

test('ugyldig periode-parameter faller tilbake til 7 dager (tolkPeriode)', async () => {
  const loginRes = await fetch(`${BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ epost: TEST_EPOST, passord: 'TestPassord1234' }),
    redirect: 'manual',
  });
  const cookie = loginRes.headers.get('set-cookie');

  const res = await fetch(`${BASE}/api/innsikt?periode=ugyldig-verdi`, { headers: { cookie } });
  const data = await res.json();
  assert.equal(data.periode.valgt, '7');
});


// ─── Del 2: aggregeringsmatte mot kjente fixture-rader ─────────────────────

async function tellRetention() {
  const data = await hentInnsikt('7');
  return { teller: data.retention.teller, nevner: data.retention.nevner };
}

test('KPI/funnel: kjent fixture gir kjente tall (COUNT DISTINCT visitor_id, ikke rå eventtall)', async () => {
  const før = await hentInnsikt('7');

  const visitorId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const baseEventId = `test-fixture-event-${crypto.randomUUID()}`;
  const eventId = `${baseEventId}__2026-01-01`; // occurrence-format — bekrefter base_event_id-kobling

  try {
    await pool.query(
      `INSERT INTO analytics_visitors (visitor_id, first_seen, last_seen) VALUES ($1, NOW(), NOW())`,
      [visitorId],
    );
    await pool.query(
      `INSERT INTO analytics_sessions (session_id, visitor_id, started_at, last_seen_at, platform)
       VALUES ($1, $2, NOW(), NOW(), 'web')`,
      [sessionId, visitorId],
    );

    // Samme bruker åpner SAMME event to ganger — skal telle som ÉN unik
    // åpner, ikke to (DEL 8 i oppgaven: distinct visitor_id, ikke rå antall).
    for (let i = 0; i < 2; i++) {
      await pool.query(
        `INSERT INTO analytics_events (visitor_id, session_id, event_name, event_id, base_event_id, category, created_at)
         VALUES ($1, $2, 'kort_åpnet', $3, $4, 'musikk', NOW())`,
        [visitorId, sessionId, eventId, baseEventId],
      );
    }
    await pool.query(
      `INSERT INTO analytics_events (visitor_id, session_id, event_name, event_id, base_event_id, category, created_at)
       VALUES ($1, $2, 'event_lagret', $3, $4, 'musikk', NOW())`,
      [visitorId, sessionId, eventId, baseEventId],
    );
    await pool.query(
      `INSERT INTO analytics_saved_events (visitor_id, event_id, base_event_id, saved_at)
       VALUES ($1, $2, $3, NOW())`,
      [visitorId, eventId, baseEventId],
    );

    const etter = await hentInnsikt('7');

    assert.equal(etter.summary.unikeBrukere.verdi, før.summary.unikeBrukere.verdi + 1);
    assert.equal(etter.summary.nyeBrukere.verdi, før.summary.nyeBrukere.verdi + 1);
    assert.equal(etter.summary.sessions.verdi, før.summary.sessions.verdi + 1);
    // Åpnet to ganger, men skal KUN telle som 1 unik åpner:
    assert.equal(etter.summary.eventaapnere.verdi, før.summary.eventaapnere.verdi + 1);
    assert.equal(etter.summary.lagrere.verdi, før.summary.lagrere.verdi + 1);
    assert.equal(etter.summary.harLagretNa.verdi, før.summary.harLagretNa.verdi + 1);

    // Funnel bygger på de samme unike tallene
    const besøkSteg = etter.funnel.find((s) => s.navn === 'Besøk');
    const åpnetSteg = etter.funnel.find((s) => s.navn === 'Åpnet minst ett event');
    assert.equal(besøkSteg.antall, etter.summary.unikeBrukere.verdi);
    assert.equal(åpnetSteg.antall, etter.summary.eventaapnere.verdi);

    // Topp events: occurrence-ID-en skal rulles opp til base_event_id, med
    // 1 unik åpner (ikke 2) og aktiv lagring nå = 1.
    const rad = etter.topEvents.find((r) => r.id === baseEventId);
    assert.ok(rad, 'det nye eventet skal finnes i topEvents, gruppert på base_event_id');
    assert.equal(rad.aapnere, 1);
    assert.equal(rad.lagrere, 1);
    assert.equal(rad.aktiveLagringerNa, 1);
    assert.equal(rad.aapningTilLagringPct, 100);
  } finally {
    await pool.query(`DELETE FROM analytics_saved_events WHERE visitor_id = $1`, [visitorId]);
    await pool.query(`DELETE FROM analytics_events WHERE visitor_id = $1`, [visitorId]);
    await pool.query(`DELETE FROM analytics_sessions WHERE visitor_id = $1`, [visitorId]);
    await pool.query(`DELETE FROM analytics_visitors WHERE visitor_id = $1`, [visitorId]);
  }
});

test('Retention: kun brukere som faktisk startet en ny session 1–7 dager etter førstebesøk telles som "tilbake"', async () => {
  const før = await tellRetention();

  const returnerendeId = crypto.randomUUID();
  const ikkeReturnerendeId = crypto.randomUUID();
  const forTidligId = crypto.randomUUID(); // kvalifiserer IKKE ennå (< 7 dager siden first_seen)

  try {
    // Kvalifisert (first_seen for 8 dager siden) OG kom tilbake etter 2 dager
    await pool.query(
      `INSERT INTO analytics_visitors (visitor_id, first_seen, last_seen)
       VALUES ($1, NOW() - interval '8 days', NOW() - interval '6 days')`,
      [returnerendeId],
    );
    await pool.query(
      `INSERT INTO analytics_sessions (session_id, visitor_id, started_at, last_seen_at)
       VALUES ($1, $2, NOW() - interval '6 days', NOW() - interval '6 days')`,
      [crypto.randomUUID(), returnerendeId],
    );

    // Kvalifisert, men ALDRI kommet tilbake
    await pool.query(
      `INSERT INTO analytics_visitors (visitor_id, first_seen, last_seen)
       VALUES ($1, NOW() - interval '8 days', NOW() - interval '8 days')`,
      [ikkeReturnerendeId],
    );

    // IKKE kvalifisert ennå — first_seen kun 2 dager siden
    await pool.query(
      `INSERT INTO analytics_visitors (visitor_id, first_seen, last_seen)
       VALUES ($1, NOW() - interval '2 days', NOW() - interval '2 days')`,
      [forTidligId],
    );

    const etter = await tellRetention();

    // Nevner: +2 (kun de to kvalifiserte, IKKE "for tidlig"-brukeren)
    assert.equal(etter.nevner, før.nevner + 2);
    // Teller: +1 (kun den faktisk returnerende)
    assert.equal(etter.teller, før.teller + 1);
  } finally {
    await pool.query(`DELETE FROM analytics_sessions WHERE visitor_id IN ($1, $2, $3)`, [returnerendeId, ikkeReturnerendeId, forTidligId]);
    await pool.query(`DELETE FROM analytics_visitors WHERE visitor_id IN ($1, $2, $3)`, [returnerendeId, ikkeReturnerendeId, forTidligId]);
  }
});
