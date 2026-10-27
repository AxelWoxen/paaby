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

// Brukes KUN for CHANGED (se run.js). I likhet med oppdaterSett over røres
// content_hash ALDRI — men content_snapshot oppdateres til det vi NÅ ser,
// slik at NESTE CHANGED-observasjon kan diffes mot et korrekt utgangspunkt
// (se core/sync.js:diffSnapshots). Selve event_source_changes-raden logges
// separat av loggKildeEndring() — denne funksjonen eier kun selve refen.
export async function oppdaterEndretObservasjon(refId, { sourceStatus = null, sourceUpdatedAt = null, contentSnapshot }) {
  await pool.query(
    `
      UPDATE event_sources
      SET
        last_seen_at = NOW(),
        source_status = $2,
        source_updated_at = $3,
        content_snapshot = $4
      WHERE id = $1
    `,
    [refId, sourceStatus, sourceUpdatedAt, JSON.stringify(contentSnapshot ?? {})],
  );
}

// Hashen fra SISTE LOGGEDE event_source_changes-rad for denne kilden, eller
// null hvis ingen endring er logget ennå. Brukes til å dedupe: samme uløste
// endring skal kun logges ÉN gang, ikke på nytt hver collector-kjøring (se
// run.js — CHANGED er med vilje "sticky" siden content_hash fryses).
export async function finnSisteLoggetHash(eventSourceId) {
  const result = await pool.query(
    `
      SELECT observed_content_hash
      FROM event_source_changes
      WHERE event_source_id = $1
      ORDER BY observed_at DESC
      LIMIT 1
    `,
    [eventSourceId],
  );
  return result.rows[0]?.observed_content_hash ?? null;
}

// Logger ÉN observert kilde-endring. Ingen UPDATE av candidate/publisert
// event her — kun historikk (se 011_event_source_changes.sql).
export async function loggKildeEndring({ eventSourceId, previousContentHash, observedContentHash, changedFields, diff }) {
  await pool.query(
    `
      INSERT INTO event_source_changes (
        event_source_id, previous_content_hash, observed_content_hash, changed_fields, diff
      )
      VALUES ($1, $2, $3, $4, $5)
    `,
    [eventSourceId, previousContentHash, observedContentHash, changedFields, JSON.stringify(diff ?? {})],
  );
}

// Lager en ref KOBLET TIL et eksisterende candidate/published event (sterk
// URL-match) — ingen ny candidate opprettes, vi lærer bare at denne kilde-
// id-en tilhører noe vi allerede har.
export async function opprettRefTilEksisterende({
  provider, externalId, sourceUrl, sourceStatus, sourceUpdatedAt, contentHash, contentSnapshot = null,
  candidateId = null, publishedEventId = null,
}) {
  const result = await pool.query(
    `
      INSERT INTO event_sources (
        provider, external_id, source_url, source_status, source_updated_at,
        content_hash, content_snapshot, candidate_id, event_id, last_seen_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      ON CONFLICT (provider, external_id) DO NOTHING
      RETURNING id
    `,
    [provider, externalId, sourceUrl, sourceStatus, sourceUpdatedAt, contentHash, JSON.stringify(contentSnapshot ?? {}), candidateId, publishedEventId],
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
  provider, externalId, sourceUrl, sourceStatus, sourceUpdatedAt, contentHash, contentSnapshot = null,
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
            content_hash, content_snapshot, candidate_id, last_seen_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
          ON CONFLICT (provider, external_id) DO NOTHING
        `,
        [provider, externalId, sourceUrl, sourceStatus, sourceUpdatedAt, contentHash, JSON.stringify(contentSnapshot ?? {}), candidateId],
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
