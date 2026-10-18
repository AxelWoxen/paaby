// external-event-refs.js — CRUD mot event_sources, Påbys tabell for stabil
// ekstern kilde-identitet (provider + external_id). Se
// 009_external_source_identity.sql for hvorfor dette er en utvidelse av en
// allerede eksisterende, men ubrukt, tabell — ikke en ny parallell en.
//
// SOURCE-OWNED vs PÅBY-OWNED: denne filen skriver ALDRI til event_candidates
// sitt payload eller events-tabellen utover selve koblingen (candidate_id/
// event_id). Den har ingen mening om kuratortekst, fremhevet, Påby-tags osv.

import pool from '../../backend/db/pool.mjs';
import { leggTilEnCandidateMedClient } from './candidates-db.js';

/**
 * @returns {Object|null}  rad fra event_sources, eller null hvis ukjent
 */
export async function finnRef(provider, externalId) {
  const result = await pool.query(
    `SELECT * FROM event_sources WHERE provider = $1 AND external_id = $2`,
    [provider, externalId],
  );
  return result.rows[0] ?? null;
}

// Brukes for BÅDE UNCHANGED og CHANGED: begge tilfeller skal oppdatere
// last_seen_at (vi så eventet igjen) og kildens egne status/updated_at-felt.
// content_hash røres bevisst ALDRI her — se egen kommentar i run.js om
// hvorfor (CHANGED skal fortsatt oppdages som CHANGED neste kjøring, helt
// til selve endringen er håndtert).
export async function oppdaterSett(refId, { sourceStatus = null, sourceUpdatedAt = null } = {}) {
  await pool.query(
    `
      UPDATE event_sources
      SET
        last_seen_at = NOW(),
        source_status = $2,
        source_updated_at = $3
      WHERE id = $1
    `,
    [refId, sourceStatus, sourceUpdatedAt],
  );
}

// Lager en ref KOBLET TIL et eksisterende candidate/published event (sterk
// URL-match) — ingen ny candidate opprettes, vi lærer bare at denne kilde-
// id-en tilhører noe vi allerede har.
export async function opprettRefTilEksisterende({
  provider, externalId, sourceUrl, sourceStatus, sourceUpdatedAt, contentHash,
  candidateId = null, publishedEventId = null,
}) {
  const result = await pool.query(
    `
      INSERT INTO event_sources (
        provider, external_id, source_url, source_status, source_updated_at,
        content_hash, candidate_id, event_id, last_seen_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (provider, external_id) DO NOTHING
      RETURNING id
    `,
    [provider, externalId, sourceUrl, sourceStatus, sourceUpdatedAt, contentHash, candidateId, publishedEventId],
  );
  return result.rows[0]?.id ?? null;
}

/**
 * Oppretter en helt ny candidate OG dens event_sources-ref i samme
 * transaksjon — slik at vi aldri havner i en tilstand der den ene finnes
 * uten den andre.
 *
 * @returns {{ candidateId: string|null, lagtTil: boolean }}
 *   lagtTil: false hvis candidaten allerede fantes (samme legacy_id) —
 *   ref opprettes uansett, slik at kilden ikke prøver på nytt hver kjøring.
 */
export async function opprettCandidateOgRef({
  event, source = 'collector', muligDuplikat = false, duplikatHint = null,
  provider, externalId, sourceUrl, sourceStatus, sourceUpdatedAt, contentHash,
}) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { id: candidateId, lagtTil } = await leggTilEnCandidateMedClient(
      client, event, { source, muligDuplikat, duplikatHint },
    );

    if (candidateId) {
      await client.query(
        `
          INSERT INTO event_sources (
            provider, external_id, source_url, source_status, source_updated_at,
            content_hash, candidate_id, last_seen_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
          ON CONFLICT (provider, external_id) DO NOTHING
        `,
        [provider, externalId, sourceUrl, sourceStatus, sourceUpdatedAt, contentHash, candidateId],
      );
    }

    await client.query('COMMIT');
    return { candidateId, lagtTil };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
