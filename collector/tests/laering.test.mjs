// laering.test.mjs — at hver beslutning i review spores (candidate_decisions)
// med grunn og agentens score på det tidspunktet, og at treningsdataene
// bare lærer av avslag som faktisk handler om smak.
//
// Kjører mot lokal paaby_dev (samme mønster som tests/run.test.mjs).
// ALDRI mot produksjon. Rydder opp alt den lager, i after().
//
// Kjør: cd collector && node --test tests/laering.test.mjs

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pool from '../../backend/db/pool.mjs';
import { leggTilCandidates, markerAvslatt, markerTriagert, markerInkludert, lesCandidates } from '../store/candidates-db.js';
import { lesTreningsdata, oppdaterVurdering, startKjøring, avsluttKjøring } from '../store/laering.js';
import { scorVentendePåNytt } from '../run.js';
import { trenModell } from '../core/interesse.js';

const PREFIKS = `test-laering-${crypto.randomUUID()}`;
const runIder = [];

after(async () => {
  await pool.query(`DELETE FROM event_candidates WHERE legacy_id LIKE $1`, [`${PREFIKS}%`]);
  if (runIder.length) await pool.query(`DELETE FROM collector_runs WHERE id = ANY($1)`, [runIder]);
  await pool.end();
});

async function lagCandidate(navn) {
  const id = `${PREFIKS}-${navn}`;
  await leggTilCandidates([{
    id,
    tittel: `Laering ${navn} ${PREFIKS}`,
    kategori: 'musikk',
    sted: 'Testlokale',
    start: '2099-01-01T20:00:00+01:00',
    pris: 100,
  }]);
  const { rows } = await pool.query(`SELECT id FROM event_candidates WHERE legacy_id = $1`, [id]);
  return { legacyId: id, dbId: rows[0].id };
}

test('avslag med grunn → reject_reason + én rad i candidate_decisions med score-snapshot', async () => {
  const { legacyId, dbId } = await lagCandidate('avslag');
  await oppdaterVurdering(dbId, { score: 23, grunner: [], mangler: ['bilde'], holdtUte: 'regel: «kurs»' });

  assert.equal(await markerAvslatt(legacyId, { grunn: 'duplikat' }), true);

  const rad = await pool.query(`SELECT status, reject_reason FROM event_candidates WHERE id = $1`, [dbId]);
  assert.equal(rad.rows[0].status, 'rejected');
  assert.equal(rad.rows[0].reject_reason, 'duplikat');

  const logg = await pool.query(`SELECT decision, reason, interest_score, kept_out_reason FROM candidate_decisions WHERE candidate_id = $1`, [dbId]);
  assert.equal(logg.rowCount, 1);
  assert.deepEqual(logg.rows[0], { decision: 'rejected', reason: 'duplikat', interest_score: 23, kept_out_reason: 'regel: «kurs»' });
});

test('triage logges som egen beslutning', async () => {
  const { legacyId, dbId } = await lagCandidate('triage');
  assert.equal(await markerTriagert(legacyId), true);
  const logg = await pool.query(`SELECT decision FROM candidate_decisions WHERE candidate_id = $1`, [dbId]);
  assert.deepEqual(logg.rows.map((r) => r.decision), ['triaged']);
});

test('lesTreningsdata: tar med triagert og avslått med grunn — merkUtfall avgjør hva som lærer', async () => {
  const { legacyId } = await lagCandidate('smak');
  await markerAvslatt(legacyId, { grunn: 'ikke-relevant' });

  const rader = (await lesTreningsdata()).filter((r) => r.tittel?.includes(PREFIKS));
  const etter = Object.fromEntries(rader.map((r) => [r.tittel.split(' ')[1], r]));

  assert.equal(etter.triage.status, 'triaged');
  assert.equal(etter.avslag.rejectReason, 'duplikat');
  assert.equal(etter.smak.rejectReason, 'ikke-relevant');
  assert.equal(etter.smak.pris, 100);
  assert.equal(etter.smak.provider, 'collector'); // ingen event_sources → candidate.source
});

test('collector_runs: start og avslutt lagrer horisont, stats og treningsstørrelse', async () => {
  const runId = await startKjøring(14);
  runIder.push(runId);
  await avsluttKjøring(runId, { stats: { nye: 3 }, treningsstørrelse: 42 });
  const { rows } = await pool.query(`SELECT horizon_days, stats, training_size, finished_at FROM collector_runs WHERE id = $1`, [runId]);
  assert.equal(rows[0].horizon_days, 14);
  assert.deepEqual(rows[0].stats, { nye: 3 });
  assert.equal(rows[0].training_size, 42);
  assert.ok(rows[0].finished_at);
});

test('Legg i utvalget: fjerner holdt ute, logges, og en ny kjøring holder det ikke ute igjen', async () => {
  const { legacyId, dbId } = await lagCandidate('inkluder');
  await pool.query(`UPDATE event_candidates SET source = 'collector' WHERE id = $1`, [dbId]);
  await oppdaterVurdering(dbId, { score: 12, grunner: [], mangler: [], holdtUte: 'regel: «laering»' });

  let kandidat = (await lesCandidates()).find((c) => c.id === legacyId);
  assert.equal(kandidat._agentValg, 'ikke-valgt');

  assert.equal(await markerInkludert(legacyId), true);

  const logg = await pool.query(`SELECT decision, interest_score, kept_out_reason FROM candidate_decisions WHERE candidate_id = $1`, [dbId]);
  assert.deepEqual(logg.rows, [{ decision: 'included', interest_score: 12, kept_out_reason: 'regel: «laering»' }]);

  // Ny kjøring med en regel som fortsatt treffer tittelen — skal IKKE holde den ute igjen.
  const modell = trenModell([]);
  await scorVentendePåNytt({ modell, regler: { holdUte: { ord: ['laering'] } } });
  kandidat = (await lesCandidates()).find((c) => c.id === legacyId);
  assert.equal(kandidat._holdtUte, null);
  assert.equal(kandidat._inkludertManuelt, true);
  assert.equal(kandidat._agentValg, 'valgt');

  assert.equal(await markerInkludert('finnes-ikke'), false);
});
