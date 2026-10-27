// run.test.mjs — dekker den delen av testlisten som faktisk krever en
// database: NEW/UNCHANGED/CHANGED mot ekte event_sources-rader, rejected
// som ikke gjenoppstår, published/candidate som kobles i stedet for å
// duplisere candidate, og at én ukjent/feilende kilde ikke stopper andre.
//
// Kjører mot lokal paaby_dev (samme mønster som collector/review/tests/*).
// ALDRI mot produksjon. Rydder opp alt den lager, i after().
//
// Kjør: cd collector && node --test tests/run.test.mjs

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pool from '../../backend/db/pool.mjs';
import { behandleEvent, behandleKilde, skalHoppeOverKilde } from '../run.js';
import { normaliser } from '../normalize.js';

const PROVIDER = `test-provider-${crypto.randomUUID()}`;
const opprettedeLegacyIder = [];
const opprettedeEventIder = [];

after(async () => {
  await pool.query(`DELETE FROM event_sources WHERE provider = $1`, [PROVIDER]);
  if (opprettedeLegacyIder.length) {
    await pool.query(`DELETE FROM event_candidates WHERE legacy_id = ANY($1)`, [opprettedeLegacyIder]);
  }
  if (opprettedeEventIder.length) {
    await pool.query(`DELETE FROM events WHERE id = ANY($1)`, [opprettedeEventIder]);
  }
  await pool.end();
});

function tomTellere() {
  return { nye: 0, uendret: 0, endret: 0, koblet: 0, avslått: 0, muligDuplikat: 0 };
}

// title er bevisst påkrevd (ingen default) — legacy_id (og dermed radens
// identitet i event_candidates sin UNIQUE-constraint) avledes av
// tittel+sted+dato, så hver test MÅ ha en egen tittel for ikke å kollidere
// med andre tester i samme fil mot samme database. To kall med samme
// tittel/sted/dato er bevisst kun brukt når testen selv vil teste et
// fuzzy-duplikat (samme innhold, ulik kilde).
function lagExternal({ title, ...overrides } = {}) {
  return {
    provider: PROVIDER,
    externalId: 'ext-1',
    sourceUrl: 'https://eksempel.no/event-1',
    sourceStatus: 'scheduled',
    sourceUpdatedAt: '2026-01-01T00:00:00Z',
    title,
    description: 'En testbeskrivelse',
    start: '2026-12-01T20:00:00+01:00',
    end: null,
    venue: { name: 'Testlokale', address: 'Testgate 1', latitude: 59.9, longitude: 10.7 },
    pricing: { min: 100, max: 100, currency: 'NOK', text: null },
    imageUrl: null,
    categoryHints: [],
    defaultCategory: 'musikk',
    ...overrides,
  };
}

// ─── Generiske, DB-uavhengige kontrakter ────────────────────────────────────

test('skalHoppeOverKilde — generisk tokenEnv-sjekk, uavhengig av adapter', () => {
  assert.equal(skalHoppeOverKilde({ tokenEnv: 'X' }, {}), true);
  assert.equal(skalHoppeOverKilde({ tokenEnv: 'X' }, { X: 'noe' }), false);
  assert.equal(skalHoppeOverKilde({}, {}), false);
});

test('behandleKilde — ukjent adapter feiler lokalt, kaster ikke videre (andre kilder kan fortsette)', async () => {
  const resultat = await behandleKilde(
    { id: 'ukjent-test-kilde', adapter: 'finnes-ikke' },
    { avslåtteIder: new Set(), eksisterende: [] },
  );
  assert.equal(resultat.feil, 1);
});

// ─── NEW / UNCHANGED / CHANGED ──────────────────────────────────────────────

test('NEW: første gang et source-event sees → ny candidate + event_sources-ref', async () => {
  const external = lagExternal({ title: 'Testhendelse NY', externalId: 'ext-new' });
  const paaby = normaliser(external);
  opprettedeLegacyIder.push(paaby.id);

  const tellere = tomTellere();
  await behandleEvent(external, paaby, { avslåtteIder: new Set(), eksisterende: [], tellere });
  assert.equal(tellere.nye, 1);

  const candidateRad = await pool.query(`SELECT status FROM event_candidates WHERE legacy_id = $1`, [paaby.id]);
  assert.equal(candidateRad.rowCount, 1);
  assert.equal(candidateRad.rows[0].status, 'pending');

  const refRad = await pool.query(
    `SELECT candidate_id, content_hash FROM event_sources WHERE provider = $1 AND external_id = $2`,
    [PROVIDER, 'ext-new'],
  );
  assert.equal(refRad.rowCount, 1);
  assert.ok(refRad.rows[0].candidate_id);
});

test('UNCHANGED: samme source-event neste kjøring → ingen ny candidate', async () => {
  const external = lagExternal({ title: 'Testhendelse UENDRET', externalId: 'ext-unchanged' });
  const paaby = normaliser(external);
  opprettedeLegacyIder.push(paaby.id);

  await behandleEvent(external, paaby, { avslåtteIder: new Set(), eksisterende: [], tellere: tomTellere() });

  const tellere2 = tomTellere();
  await behandleEvent(external, paaby, { avslåtteIder: new Set(), eksisterende: [], tellere: tellere2 });
  assert.equal(tellere2.nye, 0);
  assert.equal(tellere2.uendret, 1);

  const antall = await pool.query(`SELECT count(*) FROM event_candidates WHERE legacy_id = $1`, [paaby.id]);
  assert.equal(antall.rows[0].count, '1');
});

test('CHANGED: starttid endres hos kilden → oppdages som CHANGED, ingen ny candidate, ref-hash forblir gammel', async () => {
  const external1 = lagExternal({ title: 'Testhendelse ENDRET', externalId: 'ext-changed', start: '2026-12-05T20:00:00+01:00' });
  const paaby1 = normaliser(external1);
  opprettedeLegacyIder.push(paaby1.id);

  await behandleEvent(external1, paaby1, { avslåtteIder: new Set(), eksisterende: [], tellere: tomTellere() });

  const refFør = await pool.query(
    `SELECT content_hash FROM event_sources WHERE provider = $1 AND external_id = $2`,
    [PROVIDER, 'ext-changed'],
  );

  const external2 = lagExternal({ title: 'Testhendelse ENDRET', externalId: 'ext-changed', start: '2026-12-06T21:00:00+01:00' }); // flyttet
  const paaby2 = normaliser(external2);
  opprettedeLegacyIder.push(paaby2.id); // annen legacy_id siden dato endres

  const tellereB = tomTellere();
  await behandleEvent(external2, paaby2, { avslåtteIder: new Set(), eksisterende: [], tellere: tellereB });
  assert.equal(tellereB.nye, 0);
  assert.equal(tellereB.endret, 1);

  // Fortsatt bare den OPPRINNELIGE candidaten — endringen opprettet ingen ny.
  const antall = await pool.query(
    `SELECT count(*) FROM event_candidates WHERE legacy_id = ANY($1)`,
    [[paaby1.id, paaby2.id]],
  );
  assert.equal(antall.rows[0].count, '1');

  // Hashen på ref-raden skal IKKE ha flyttet seg til den nye verdien ennå —
  // ellers ville neste kjøring trodd eventet var uendret.
  const refEtter = await pool.query(
    `SELECT content_hash FROM event_sources WHERE provider = $1 AND external_id = $2`,
    [PROVIDER, 'ext-changed'],
  );
  assert.equal(refEtter.rows[0].content_hash, refFør.rows[0].content_hash);

  // Og en TREDJE kjøring med samme (endrede) data rapporterer fortsatt CHANGED.
  const tellereC = tomTellere();
  await behandleEvent(external2, paaby2, { avslåtteIder: new Set(), eksisterende: [], tellere: tellereC });
  assert.equal(tellereC.endret, 1);
});

// ─── Rejected / published ───────────────────────────────────────────────────

test('rejected: avslått candidate kommer ikke tilbake som ny candidate', async () => {
  const external = lagExternal({ title: 'Testhendelse AVSLÅTT', externalId: 'ext-rejected' });
  const paaby = normaliser(external);
  opprettedeLegacyIder.push(paaby.id);

  const tellere = tomTellere();
  await behandleEvent(external, paaby, { avslåtteIder: new Set([paaby.id]), eksisterende: [], tellere });

  assert.equal(tellere.nye, 0);
  assert.equal(tellere.avslått, 1);

  const antall = await pool.query(`SELECT count(*) FROM event_candidates WHERE legacy_id = $1`, [paaby.id]);
  assert.equal(antall.rows[0].count, '0');
});

test('published: samme lenke som et allerede publisert event → kobles via event_sources, ingen ny candidate', async () => {
  const eventRad = await pool.query(
    `INSERT INTO events (title, event_url, status) VALUES ($1, $2, 'active') RETURNING id`,
    ['Allerede publisert testevent', 'https://eksempel.no/allerede-publisert'],
  );
  const publisertId = eventRad.rows[0].id;
  opprettedeEventIder.push(publisertId);

  const external = lagExternal({ title: 'Testhendelse PUBLISERT-MATCH', externalId: 'ext-published-match', sourceUrl: 'https://eksempel.no/allerede-publisert' });
  const paaby = normaliser(external);
  // IKKE i opprettedeLegacyIder — ingen candidate skal opprettes for denne.

  const publisertSomEksisterende = {
    tittel: 'Allerede publisert testevent', sted: 'Et helt annet sted', start: '2099-01-01T00:00:00+01:00',
    lenke: 'https://eksempel.no/allerede-publisert',
    _erCandidate: false, _dbId: publisertId,
  };

  const tellere = tomTellere();
  await behandleEvent(external, paaby, {
    avslåtteIder: new Set(),
    eksisterende: [publisertSomEksisterende],
    tellere,
  });

  assert.equal(tellere.nye, 0);
  assert.equal(tellere.koblet, 1);

  const candidateAntall = await pool.query(`SELECT count(*) FROM event_candidates WHERE legacy_id = $1`, [paaby.id]);
  assert.equal(candidateAntall.rows[0].count, '0');

  const refRad = await pool.query(
    `SELECT event_id, candidate_id FROM event_sources WHERE provider = $1 AND external_id = $2`,
    [PROVIDER, 'ext-published-match'],
  );
  assert.equal(refRad.rowCount, 1);
  assert.equal(refRad.rows[0].event_id, publisertId);
  assert.equal(refRad.rows[0].candidate_id, null);
});

test('usikkert (fuzzy) treff mot eksisterende candidate → NY candidate med possible_duplicate, ikke auto-merge', async () => {
  const eksisterendeExternal = lagExternal({ title: 'Testhendelse FUZZY', externalId: 'ext-fuzzy-original', sourceUrl: 'https://eksempel.no/original' });
  const eksisterendePaaby = normaliser(eksisterendeExternal);
  opprettedeLegacyIder.push(eksisterendePaaby.id);
  await behandleEvent(eksisterendeExternal, eksisterendePaaby, { avslåtteIder: new Set(), eksisterende: [], tellere: tomTellere() });

  const candidateRad = await pool.query(`SELECT id FROM event_candidates WHERE legacy_id = $1`, [eksisterendePaaby.id]);
  const eksisterendeCandidate = {
    ...eksisterendePaaby,
    lenke: eksisterendePaaby.lenke,
    _erCandidate: true,
    _dbId: candidateRad.rows[0].id,
  };

  // Samme tittel/dato/sted (derav samme legacy_id!), men FRA EN ANNEN KILDE
  // og ANNEN lenke — kun et fuzzy-treff, ikke et sikkert url-treff.
  const nyExternal = lagExternal({ title: 'Testhendelse FUZZY', externalId: 'ext-fuzzy-duplicate', sourceUrl: 'https://en-annen-kilde.no/samme-event' });
  const nyPaaby = normaliser(nyExternal);
  // Siden legacy_id kolliderer med det eksisterende treffet, disambiguerer
  // behandleEvent() selv den lagrede id-en (se kommentar i run.js) — rydd
  // opp den disambiguerte varianten, ikke nyPaaby.id direkte.
  const disambiguertId = `${nyPaaby.id}__${PROVIDER}-ext-fuzzy-duplicate`;
  opprettedeLegacyIder.push(disambiguertId);

  const tellere = tomTellere();
  await behandleEvent(nyExternal, nyPaaby, {
    avslåtteIder: new Set(),
    eksisterende: [eksisterendeCandidate],
    tellere,
  });

  assert.equal(tellere.nye, 1); // NY candidate — ikke koblet/slått sammen
  assert.equal(tellere.koblet, 0);
  assert.equal(tellere.muligDuplikat, 1);

  const nyCandidateRad = await pool.query(
    `SELECT possible_duplicate, duplicate_hint FROM event_candidates WHERE legacy_id = $1`,
    [disambiguertId],
  );
  assert.equal(nyCandidateRad.rowCount, 1);
  assert.equal(nyCandidateRad.rows[0].possible_duplicate, true);
  assert.ok(nyCandidateRad.rows[0].duplicate_hint);
});

test('to events med samme tittel/dato/sted i SAMME kjøring (ingen forhåndslastet treff) → begge blir egne candidates, ingen forsvinner stille', async () => {
  // Regresjonstest for en ekte bug funnet med Ticketmaster-data: to
  // visninger av samme produksjon samme dag (ulikt klokkeslett, så samme
  // dato-granulære legacy_id) fra to ulike externalId-er. Siden ingen av
  // dem fantes i candidates/publiserte FØR kjøringen, fanger ikke
  // finnEksisterendeMatch() kollisjonen — det må opprettetIDenneKjøringen
  // (delt mellom kall i samme run) gjøre.
  const opprettetIDenneKjøringen = new Map();

  const visning1 = lagExternal({ title: 'Testhendelse TOVISNINGER', externalId: 'ext-visning-1', start: '2026-12-10T14:30:00+01:00', sourceUrl: 'https://eksempel.no/visning-1' });
  const paaby1 = normaliser(visning1);
  opprettedeLegacyIder.push(paaby1.id);

  const tellere1 = tomTellere();
  await behandleEvent(visning1, paaby1, { avslåtteIder: new Set(), eksisterende: [], opprettetIDenneKjøringen, tellere: tellere1 });
  assert.equal(tellere1.nye, 1);
  assert.equal(tellere1.muligDuplikat, 0); // den FØRSTE er ikke et duplikat av noe

  // Samme dag, annet klokkeslett → SAMME legacy_id (dato-granulær), men en
  // helt annen kilde-id. eksisterende er fortsatt tom — kun
  // opprettetIDenneKjøringen kan fange dette.
  const visning2 = lagExternal({ title: 'Testhendelse TOVISNINGER', externalId: 'ext-visning-2', start: '2026-12-10T18:00:00+01:00', sourceUrl: 'https://eksempel.no/visning-2' });
  const paaby2 = normaliser(visning2);
  assert.equal(paaby2.id, paaby1.id); // bekrefter at dette faktisk er den kollisjonen vi tester
  const disambiguertId2 = `${paaby2.id}__${PROVIDER}-ext-visning-2`;
  opprettedeLegacyIder.push(disambiguertId2);

  const tellere2 = tomTellere();
  await behandleEvent(visning2, paaby2, { avslåtteIder: new Set(), eksisterende: [], opprettetIDenneKjøringen, tellere: tellere2 });
  assert.equal(tellere2.nye, 1); // visning 2 fikk SIN EGEN candidate …
  assert.equal(tellere2.muligDuplikat, 1); // … flagget som mulig duplikat …

  const begge = await pool.query(
    `SELECT legacy_id, possible_duplicate FROM event_candidates WHERE legacy_id = ANY($1) ORDER BY legacy_id`,
    [[paaby1.id, disambiguertId2]],
  );
  assert.equal(begge.rowCount, 2); // … og IKKE forsvunnet inn i visning 1 sin rad

  const refRader = await pool.query(
    `SELECT external_id, candidate_id FROM event_sources WHERE provider = $1 AND external_id = ANY($2)`,
    [PROVIDER, ['ext-visning-1', 'ext-visning-2']],
  );
  assert.equal(refRader.rowCount, 2);
  const [ref1, ref2] = refRader.rows;
  assert.notEqual(ref1.candidate_id, ref2.candidate_id); // hver ref peker på SIN EGEN candidate
});


// ─── event_source_changes (source change history) ──────────────────────────
// Se 011_event_source_changes.sql — denne historikken må IKKE påvirke
// CHANGED-policyen selv (dekket av CHANGED-testen over, som fortsatt passerer
// uendret med disse endringene).

test('event_source_changes: UNCHANGED skriver ingen historikkrad', async () => {
  const external = lagExternal({ title: 'Testhendelse HISTORIKK UENDRET', externalId: 'ext-history-unchanged' });
  const paaby = normaliser(external);
  opprettedeLegacyIder.push(paaby.id);

  await behandleEvent(external, paaby, { avslåtteIder: new Set(), eksisterende: [], tellere: tomTellere() });
  await behandleEvent(external, paaby, { avslåtteIder: new Set(), eksisterende: [], tellere: tomTellere() }); // UNCHANGED

  const refRad = await pool.query(
    `SELECT id FROM event_sources WHERE provider = $1 AND external_id = $2`,
    [PROVIDER, 'ext-history-unchanged'],
  );
  const historikk = await pool.query(`SELECT * FROM event_source_changes WHERE event_source_id = $1`, [refRad.rows[0].id]);
  assert.equal(historikk.rowCount, 0);
});

test('event_source_changes: CHANGED skriver ÉN historikkrad med riktig changed_fields — samme uløste endring logges IKKE på nytt, men en NY endring gir en ny rad', async () => {
  const external1 = lagExternal({ title: 'Testhendelse HISTORIKK ENDRET', externalId: 'ext-history-changed', start: '2026-12-08T20:00:00+01:00' });
  const paaby1 = normaliser(external1);
  opprettedeLegacyIder.push(paaby1.id);
  await behandleEvent(external1, paaby1, { avslåtteIder: new Set(), eksisterende: [], tellere: tomTellere() });

  const external2 = lagExternal({ title: 'Testhendelse HISTORIKK ENDRET', externalId: 'ext-history-changed', start: '2026-12-09T21:00:00+01:00' });
  const paaby2 = normaliser(external2);
  opprettedeLegacyIder.push(paaby2.id);
  await behandleEvent(external2, paaby2, { avslåtteIder: new Set(), eksisterende: [], tellere: tomTellere() }); // CHANGED #1

  const refRad = await pool.query(
    `SELECT id FROM event_sources WHERE provider = $1 AND external_id = $2`,
    [PROVIDER, 'ext-history-changed'],
  );
  let historikk = await pool.query(`SELECT * FROM event_source_changes WHERE event_source_id = $1`, [refRad.rows[0].id]);
  assert.equal(historikk.rowCount, 1);
  assert.ok(historikk.rows[0].changed_fields.includes('start'));

  // Samme (fortsatt uløste) endring observert på nytt (f.eks. neste dags
  // kjøring, ingen har håndtert den) — skal IKKE logge en ny rad.
  await behandleEvent(external2, paaby2, { avslåtteIder: new Set(), eksisterende: [], tellere: tomTellere() }); // CHANGED #2, samme hash
  historikk = await pool.query(`SELECT * FROM event_source_changes WHERE event_source_id = $1`, [refRad.rows[0].id]);
  assert.equal(historikk.rowCount, 1); // fortsatt bare én rad

  // Kilden endrer seg IGJEN (ny hash) — nå skal det logges en ANDRE rad.
  const external3 = lagExternal({ title: 'Testhendelse HISTORIKK ENDRET', externalId: 'ext-history-changed', start: '2026-12-10T22:00:00+01:00' });
  const paaby3 = normaliser(external3);
  opprettedeLegacyIder.push(paaby3.id);
  await behandleEvent(external3, paaby3, { avslåtteIder: new Set(), eksisterende: [], tellere: tomTellere() });
  historikk = await pool.query(
    `SELECT * FROM event_source_changes WHERE event_source_id = $1 ORDER BY observed_at`,
    [refRad.rows[0].id],
  );
  assert.equal(historikk.rowCount, 2);
});
