import pool from '../../backend/db/pool.mjs';

function tilLegacyStatus(status) {
  if (status === 'approved') return 'godkjent';
  if (status === 'rejected') return 'avslatt';
  return 'pending';
}

// Hent alle candidates i samme format resten av collectoren kjenner.
export async function lesCandidates() {
  const result = await pool.query(`
    SELECT
      legacy_id,
      payload,
      status
    FROM event_candidates
    ORDER BY created_at ASC
  `);

  return result.rows.map((row) => ({
    ...row.payload,
    id: row.legacy_id,
    _status: tilLegacyStatus(row.status),
  }));
}

// Legg nye candidates i databasen.
// Eksisterende legacy_id hoppes over.
export async function leggTilCandidates(eventer) {
  if (!eventer.length) return 0;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    let antallLagtTil = 0;

    for (const event of eventer) {
      const { _status, ...payload } = event;

      const result = await client.query(
        `
          INSERT INTO event_candidates (
            legacy_id,
            payload,
            status
          )
          VALUES ($1, $2::jsonb, 'pending')

          ON CONFLICT (legacy_id)
          DO NOTHING

          RETURNING id
        `,
        [
          event.id,
          JSON.stringify(payload),
        ],
      );

      antallLagtTil += result.rowCount;
    }

    await client.query('COMMIT');

    return antallLagtTil;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Marker candidate som godkjent og koble den til publisert event.
export async function markerGodkjent(
  legacyId,
  publishedEventId,
) {
  const result = await pool.query(
    `
      UPDATE event_candidates
      SET
        status = 'approved',
        published_event_id = $2,
        reviewed_at = NOW()
      WHERE legacy_id = $1
      RETURNING id
    `,
    [
      legacyId,
      publishedEventId,
    ],
  );

  return result.rowCount > 0;
}

// Marker candidate som avslått.
export async function markerAvslatt(legacyId) {
  const result = await pool.query(
    `
      UPDATE event_candidates
      SET
        status = 'rejected',
        reviewed_at = NOW()
      WHERE legacy_id = $1
      RETURNING id
    `,
    [legacyId],
  );

  return result.rowCount > 0;
}

// Returnerer bare id-ene, samme format som gamle rejected.json.
export async function lesRejected() {
  const result = await pool.query(`
    SELECT legacy_id
    FROM event_candidates
    WHERE status = 'rejected'
  `);

  return result.rows.map((row) => row.legacy_id);
}