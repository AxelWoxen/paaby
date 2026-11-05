// laering.js — databasesiden av agentens læring og sporing.
// Logikken (egenskaper, modell, hold-ute) ligger i core/interesse.js — her
// er det bare lesing/skriving. Se 012_collector_laering.sql for tabellene.

import pool from '../../backend/db/pool.mjs';

export async function startKjøring(horisontDager) {
  const { rows } = await pool.query(
    `INSERT INTO collector_runs (horizon_days) VALUES ($1) RETURNING id`,
    [horisontDager],
  );
  return rows[0].id;
}

export async function avsluttKjøring(runId, { stats, treningsstørrelse }) {
  await pool.query(
    `
      UPDATE collector_runs
      SET finished_at = NOW(), stats = $2::jsonb, training_size = $3
      WHERE id = $1
    `,
    [runId, JSON.stringify(stats ?? {}), treningsstørrelse ?? null],
  );
}

/**
 * Alt agenten kan lære av, i påby-eventform + status. Publiserte events
 * (inkl. de som aldri gikk via en candidate, f.eks. den kuraterte seeden)
 * er positive. Godkjente candidates hoppes over her — de finnes allerede
 * som publiserte events, og skal ikke telles to ganger.
 *
 * @returns {Promise<{ tittel, sted, kategori, pris, start, provider, status, rejectReason, reviewedAt }[]>}
 */
export async function lesTreningsdata() {
  const [candidates, publiserte] = await Promise.all([
    pool.query(`
      SELECT
        c.payload->>'tittel'   AS tittel,
        c.payload->>'sted'     AS sted,
        c.payload->>'kategori' AS kategori,
        CASE WHEN jsonb_typeof(c.payload->'pris') = 'number'
          THEN (c.payload->>'pris')::numeric END AS pris,
        c.payload->>'start'    AS start,
        c.status,
        c.reject_reason,
        c.reviewed_at,
        COALESCE(
          (SELECT s.provider FROM event_sources s WHERE s.candidate_id = c.id ORDER BY s.created_at LIMIT 1),
          c.source
        ) AS provider
      FROM event_candidates c
      WHERE c.status IN ('triaged', 'rejected')
    `),
    pool.query(`
      SELECT
        e.title AS tittel,
        v.name  AS sted,
        (SELECT ec.category_slug FROM event_categories ec WHERE ec.event_id = e.id LIMIT 1) AS kategori,
        e.price_nok AS pris,
        (SELECT MIN(o.starts_at) FROM event_occurrences o WHERE o.event_id = e.id) AS start,
        COALESCE(
          (SELECT s.provider FROM event_sources s WHERE s.event_id = e.id ORDER BY s.created_at LIMIT 1),
          (SELECT c.source FROM event_candidates c WHERE c.published_event_id = e.id LIMIT 1),
          'kuratert'
        ) AS provider
      FROM events e
      LEFT JOIN venues v ON v.id = e.venue_id
      WHERE e.status IN ('active', 'archived')
    `),
  ]);

  const tilIso = (v) => (v instanceof Date ? v.toISOString() : v ?? null);

  return [
    ...candidates.rows.map((r) => ({
      tittel: r.tittel,
      sted: r.sted,
      kategori: r.kategori,
      pris: r.pris == null ? null : Number(r.pris),
      start: r.start,
      provider: r.provider,
      status: r.status,
      rejectReason: r.reject_reason,
      reviewedAt: tilIso(r.reviewed_at),
    })),
    ...publiserte.rows.map((r) => ({
      tittel: r.tittel,
      sted: r.sted,
      kategori: r.kategori,
      pris: r.pris,
      start: tilIso(r.start),
      provider: r.provider,
      status: 'published',
      rejectReason: null,
      reviewedAt: null,
    })),
  ];
}

/**
 * Steder vi allerede kjenner (fra tidligere publiserte events) — brukes til
 * å fylle inn adresse/koordinater kildene ikke oppgir.
 *
 * @returns {Promise<Map<string, { address, latitude, longitude }>>}  nøkkel = venues.slug
 */
export async function lesKjenteSteder() {
  const { rows } = await pool.query(`
    SELECT slug, address, latitude, longitude
    FROM venues
    WHERE address IS NOT NULL OR latitude IS NOT NULL
  `);
  return new Map(rows.map((r) => [r.slug, r]));
}

/**
 * Collector-funn som fortsatt venter i «Fra API» — scores på nytt etter
 * hver kjøring, slik at lista blir bedre sortert etter hvert som nye
 * beslutninger kommer inn (også for events funnet i en tidligere kjøring).
 */
export async function lesVentendeCollectorFunn() {
  const { rows } = await pool.query(`
    SELECT
      c.id,
      c.payload,
      c.included_manually,
      (SELECT s.provider FROM event_sources s WHERE s.candidate_id = c.id ORDER BY s.created_at LIMIT 1) AS provider
    FROM event_candidates c
    WHERE c.status = 'pending' AND c.source = 'collector'
  `);
  return rows;
}

export async function oppdaterVurdering(candidateId, { score, grunner, mangler, holdtUte }) {
  await pool.query(
    `
      UPDATE event_candidates
      SET
        interest_score = $2,
        interest_reasons = $3::jsonb,
        missing_fields = $4,
        kept_out_reason = $5
      WHERE id = $1
    `,
    [candidateId, score, JSON.stringify(grunner ?? []), mangler ?? [], holdtUte ?? null],
  );
}
