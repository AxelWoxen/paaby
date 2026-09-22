import pool from '../../backend/db/pool.mjs';

function tilLegacyStatus(status) {
  if (status === 'approved') return 'godkjent';
  if (status === 'rejected') return 'avslatt';
  if (status === 'triaged') return 'triaged';
  return 'pending';
}

// Hent alle candidates i samme format resten av collectoren kjenner.
// source og innsenderfeltene returneres som interne _-felt, på samme måte
// som _status — de skal aldri havne i selve payloadet.
export async function lesCandidates() {
  const result = await pool.query(`
    SELECT
      legacy_id,
      payload,
      status,
      source,
      submitter_name,
      submitter_org,
      submitter_contact,
      submitter_note,
      possible_duplicate,
      duplicate_hint
    FROM event_candidates
    ORDER BY created_at ASC
  `);

  return result.rows.map((row) => ({
    ...row.payload,
    id: row.legacy_id,
    _status: tilLegacyStatus(row.status),
    _kilde: row.source,
    _innsenderNavn: row.submitter_name,
    _innsenderOrg: row.submitter_org,
    _innsenderKontakt: row.submitter_contact,
    _innsenderNotat: row.submitter_note,
    _muligDuplikat: row.possible_duplicate,
    _duplikatHint: row.duplicate_hint,
  }));
}

// Legg nye candidates i databasen.
// Eksisterende legacy_id hoppes over.
export async function leggTilCandidates(eventer, { source = 'collector' } = {}) {
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
            status,
            source
          )
          VALUES ($1, $2::jsonb, 'pending', $3)

          ON CONFLICT (legacy_id)
          DO NOTHING

          RETURNING id
        `,
        [
          event.id,
          JSON.stringify(payload),
          source,
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

// Oppdater payload for en candidate (brukes av "Lagre endringer" i review-
// verktøyet, både for vanlige candidates og innsendte).
export async function oppdaterCandidatePayload(legacyId, payload) {
  const result = await pool.query(
    `
      UPDATE event_candidates
      SET payload = $2::jsonb
      WHERE legacy_id = $1
      RETURNING id
    `,
    [legacyId, JSON.stringify(payload)],
  );

  return result.rowCount > 0;
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

// Marker candidate som triagert — sendt fra "Fra API" til "Til vurdering".
// IKKE publisering: samme som avslå/godkjenn er dette et statusskifte, ikke
// et nytt sett med sideeffekter.
export async function markerTriagert(legacyId) {
  const result = await pool.query(
    `
      UPDATE event_candidates
      SET status = 'triaged'
      WHERE legacy_id = $1 AND status = 'pending'
      RETURNING id
    `,
    [legacyId],
  );

  return result.rowCount > 0;
}

// Marker candidate som avslått. Sletter samtidig et evt. opplastet bilde
// (candidate_images) — avslåtte innsendinger skal ikke fortsette å ligge
// tilgjengelig på /api/bilder/:id.
export async function markerAvslatt(legacyId) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query(
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

    if (result.rowCount > 0) {
      await client.query(
        `DELETE FROM candidate_images WHERE candidate_id = $1`,
        [result.rows[0].id],
      );
    }

    await client.query('COMMIT');
    return result.rowCount > 0;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
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