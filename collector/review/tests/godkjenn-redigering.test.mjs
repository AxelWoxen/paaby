// godkjenn-redigering.test.mjs — bekrefter at «Godkjenn» (og «Send til
// vurdering») publiserer/lagrer NØYAKTIG det som står i redigeringsskjemaet
// akkurat nå, ikke den sist LAGREDE candidate-payloaden fra databasen.
//
// Bug den dekker: admin redigerer et felt (f.eks. legger inn en bilde-URL),
// trykker «Godkjenn» direkte UTEN først å trykke «Lagre endringer» — den
// gamle candidate-versjonen ble publisert, og redigeringen gikk tapt.
//
// Spawner den faktiske review/server.js på en dedikert testport mot lokal
// paaby_dev (samme mønster som auth.test.mjs/innsikt.test.mjs).
// ALDRI mot produksjon.
//
// Kjør: cd collector && node --test review/tests/godkjenn-redigering.test.mjs

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

import pool from '../../../backend/db/pool.mjs';
import { leggTilCandidates, lesCandidates } from '../../store/candidates-db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3914; // egen testport — kolliderer ikke med de andre test-serverne
const BASE = `http://localhost:${PORT}`;
const TEST_EPOST = `godkjenn-redigering-test-${crypto.randomUUID()}@example.com`;

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
    await pool.query(`DELETE FROM events WHERE legacy_id = ANY($1)`, [opprettedeLegacyIder]); // cascader til occurrences/categories/tags
  }

  await pool.query(`DELETE FROM admin_users WHERE email = $1`, [TEST_EPOST]);
});


// ─── Hjelpere ───────────────────────────────────────────────────────────────

function nyLegacyId(merkelapp) {
  const id = `test-${merkelapp}-${crypto.randomUUID()}`;
  opprettedeLegacyIder.push(id);
  return id;
}

async function leggTilPendingCandidate(overrides = {}) {
  const id = nyLegacyId(overrides._merkelapp ?? 'candidate');
  const event = {
    id,
    tittel: 'Original tittel',
    kategori: 'musikk',
    sted: 'Original sted',
    adresse: 'Original adresse 1, Oslo',
    lat: 59.91,
    lng: 10.75,
    start: '2026-12-01T20:00:00+01:00',
    slutt: null,
    pris: 100,
    prisTekst: null,
    beskrivelse: 'Original beskrivelse',
    kuratortekst: null,
    lenke: 'https://example.com/original',
    bilde: null,
    tags: [],
    gjentas: null,
    ...overrides,
  };
  delete event._merkelapp;

  await leggTilCandidates([event], { source: overrides._source ?? 'manuell' });
  return id;
}

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

async function hentPublisertRad(legacyId) {
  const result = await pool.query(
    `
      SELECT
        e.title, e.description, e.curator_text AS kuratortekst,
        e.event_url AS lenke, e.image_url AS bilde,
        e.price_nok AS pris, e.price_text AS "prisTekst",
        e.featured, e.recurrence_rule_raw AS gjentas,
        v.name AS sted, v.address AS adresse, v.latitude AS lat, v.longitude AS lng,
        ec.category_slug AS kategori,
        (SELECT array_agg(tag_slug ORDER BY tag_slug) FROM event_tags et WHERE et.event_id = e.id) AS tags
      FROM events e
      LEFT JOIN venues v ON v.id = e.venue_id
      LEFT JOIN event_categories ec ON ec.event_id = e.id
      WHERE e.legacy_id = $1
    `,
    [legacyId],
  );
  return result.rows[0] ?? null;
}

async function hentCandidateStatus(legacyId) {
  const alle = await lesCandidates();
  return alle.find((c) => c.id === legacyId) ?? null;
}

// Basisredigering: samme shape som lagRedigeringsFelter().hentVerdier() etter
// konvertering av start/slutt til Oslo-ISO (candidate-kort.js sin jobb).
function lagRedigering(overrides = {}) {
  return {
    tittel: 'Original tittel',
    kategori: 'musikk',
    sted: 'Original sted',
    adresse: 'Original adresse 1, Oslo',
    lat: '59.91',
    lng: '10.75',
    start: '2026-12-01T20:00:00+01:00',
    slutt: '',
    pris: '100',
    prisTekst: '',
    beskrivelse: 'Original beskrivelse',
    kuratortekst: '',
    lenke: 'https://example.com/original',
    bilde: '',
    tags: [],
    ...overrides,
  };
}


// ─── Bug-reproduksjon: bilde lagt inn i skjema, Godkjenn trykkes direkte ───

test('Godkjenn uten forutgående Lagre endringer: nytt bilde fra skjemaet blir publisert', async () => {
  const id = await leggTilPendingCandidate({ bilde: null });

  const { status, data } = await post(`/api/godkjenn/${id}`, {
    redigering: lagRedigering({ bilde: 'https://example.com/nytt-bilde.jpg' }),
    fremhevet: false,
    gjentas: null,
  });

  assert.equal(status, 200, JSON.stringify(data));
  assert.equal(data.ok, true);

  const publisert = await hentPublisertRad(id);
  assert.ok(publisert, 'eventet skal være publisert');
  assert.equal(publisert.bilde, 'https://example.com/nytt-bilde.jpg');

  const candidate = await hentCandidateStatus(id);
  assert.equal(candidate._status, 'godkjent');
});


// ─── Flere felter endret i samme redigering ────────────────────────────────

test('Godkjenn publiserer endret tittel, beskrivelse, lenke og tags fra skjemaet', async () => {
  const id = await leggTilPendingCandidate();

  const { status, data } = await post(`/api/godkjenn/${id}`, {
    redigering: lagRedigering({
      tittel: 'Ny tittel fra skjemaet',
      beskrivelse: 'Ny beskrivelse fra skjemaet',
      lenke: 'https://example.com/ny-lenke',
      kategori: 'klubb',
      sted: 'Nytt sted',
      start: '2026-12-01T21:00:00+01:00', // 21:00 → auto-tag "evening"
      pris: '0', // → auto-tag "free"
      tags: ['dj', 'ticket'],
    }),
    fremhevet: true,
    gjentas: null,
  });

  assert.equal(status, 200, JSON.stringify(data));

  const publisert = await hentPublisertRad(id);
  assert.equal(publisert.title, 'Ny tittel fra skjemaet');
  assert.equal(publisert.description, 'Ny beskrivelse fra skjemaet');
  assert.equal(publisert.lenke, 'https://example.com/ny-lenke');
  assert.equal(publisert.kategori, 'klubb');
  assert.equal(publisert.sted, 'Nytt sted');
  assert.equal(publisert.featured, true);
  assert.ok(publisert.tags.includes('dj'));
  assert.ok(publisert.tags.includes('ticket'));
  assert.ok(publisert.tags.includes('evening'), 'tags skal fortsatt gå gjennom utledTags()');
  assert.ok(publisert.tags.includes('free'), 'tags skal fortsatt gå gjennom utledTags()');
});


// ─── Redigeringen lagres til candidaten selv, ikke bare til det publiserte ──

test('Godkjenn lagrer redigeringen til candidate-payloaden (ikke bare det publiserte eventet)', async () => {
  const id = await leggTilPendingCandidate();

  await post(`/api/godkjenn/${id}`, {
    redigering: lagRedigering({ kuratortekst: 'En kuratortekst' }),
    fremhevet: false,
    gjentas: null,
  });

  const candidate = await hentCandidateStatus(id);
  assert.equal(candidate.kuratortekst, 'En kuratortekst');

  const publisert = await hentPublisertRad(id);
  assert.equal(publisert.kuratortekst, 'En kuratortekst');
});


// ─── Validering: samme regler som /api/kandidat/:id/oppdater ──────────────

test('Godkjenn avviser manglende tittel (400) og publiserer ingenting', async () => {
  const id = await leggTilPendingCandidate();

  const { status, data } = await post(`/api/godkjenn/${id}`, {
    redigering: lagRedigering({ tittel: '' }),
  });

  assert.equal(status, 400);
  assert.ok(data.feil);

  const publisert = await hentPublisertRad(id);
  assert.equal(publisert, null, 'ingenting skal være publisert');

  const candidate = await hentCandidateStatus(id);
  assert.equal(candidate._status, 'pending', 'candidaten skal fortsatt vente');
});


// ─── Candidate markeres kun godkjent hvis publisering faktisk lykkes ───────

test('Hvis selve publiseringen feiler, markeres candidaten IKKE som godkjent (redigeringen beholdes)', async () => {
  const id = await leggTilPendingCandidate();

  // 'ikke-en-ekte-kategori' finnes ikke i categories-tabellen — FK-brudd
  // i publiserEvent sin event_categories-insert, hele publiseringen ruller
  // tilbake og kaster.
  const { status } = await post(`/api/godkjenn/${id}`, {
    redigering: lagRedigering({
      tittel: 'Skal ikke publiseres',
      kategori: 'ikke-en-ekte-kategori',
    }),
  });

  assert.equal(status, 500);

  const publisert = await hentPublisertRad(id);
  assert.equal(publisert, null, 'ingenting skal være publisert etter feilet publisering');

  const candidate = await hentCandidateStatus(id);
  assert.equal(candidate._status, 'pending', 'candidaten skal IKKE markeres godkjent');
  // Redigeringen ble likevel lagret til candidaten før publiseringsforsøket —
  // admin mister ikke arbeidet sitt selv om publiseringen feiler.
  assert.equal(candidate.tittel, 'Skal ikke publiseres');
});


// ─── Send til vurdering (Fra API → Til vurdering) tar også med redigeringen ─

test('Send til vurdering (triager) lagrer redigerte felter, ikke bare kuratortekst/gjentas', async () => {
  const id = await leggTilPendingCandidate({ _source: 'collector', _merkelapp: 'fra-api' });

  const { status, data } = await post(`/api/triager/${id}`, {
    redigering: lagRedigering({
      tittel: 'Redigert før triage',
      bilde: 'https://example.com/triage-bilde.jpg',
      tags: ['live'],
    }),
    gjentas: 'ukentlig:onsdag',
  });

  assert.equal(status, 200, JSON.stringify(data));

  const candidate = await hentCandidateStatus(id);
  assert.equal(candidate._status, 'triaged');
  assert.equal(candidate.tittel, 'Redigert før triage');
  assert.equal(candidate.bilde, 'https://example.com/triage-bilde.jpg');
  assert.ok(candidate.tags.includes('live'));
  assert.equal(candidate.gjentas, 'ukentlig:onsdag');
});
