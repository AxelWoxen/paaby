// bildelesing.js — sørger for at et event leses av bildemodellen HØYST
// ÉN gang (se 013_bildelesing.sql og core/bildeleser.js).

import pool from '../../backend/db/pool.mjs';

/**
 * Reserverer lesingen atomisk FØR API-kallet. Returnerer false hvis
 * bildet allerede er lest (eller forsøkt lest) — da skal det IKKE kalles.
 */
export async function reserverBildelesing(candidateId) {
  const { rowCount } = await pool.query(
    `
      UPDATE event_candidates
      SET image_read_at = NOW()
      WHERE id = $1 AND image_read_at IS NULL AND status = 'pending'
    `,
    [candidateId],
  );
  return rowCount > 0;
}

/**
 * Lagrer hva modellen fant. payload/missing_fields oppdateres bare når noe
 * faktisk ble fylt inn — ellers lagres kun resultatet for sporing.
 */
export async function lagreBildelesing(candidateId, { payload = null, fylt = [], mangler = null, resultat }) {
  if (fylt.length && payload) {
    await pool.query(
      `
        UPDATE event_candidates
        SET payload = $2::jsonb,
            missing_fields = $3,
            image_filled_fields = $4,
            image_read_result = $5::jsonb
        WHERE id = $1
      `,
      [candidateId, JSON.stringify(payload), mangler ?? [], fylt, JSON.stringify(resultat)],
    );
    return;
  }
  await pool.query(
    `UPDATE event_candidates SET image_read_result = $2::jsonb WHERE id = $1`,
    [candidateId, JSON.stringify(resultat)],
  );
}
