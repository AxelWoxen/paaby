// feedbackService.mjs — anonym "Ris eller ros?"-tilbakemelding.
// Bevisst minimal: ett felt (melding), ingen identifiserende data lagres.

import pool from '../db/pool.mjs';

const MAKS_MELDING = 2000;

/**
 * @returns {{ feil: string }|{ melding: string }}
 */
export function validerFeedback(body) {
  const melding = typeof body?.melding === 'string' ? body.melding.trim() : '';

  if (!melding) return { feil: 'Skriv en melding først.' };
  if (melding.length > MAKS_MELDING) return { feil: `Maks ${MAKS_MELDING} tegn.` };

  return { melding };
}

/**
 * Lagrer meldingen FØR e-postvarsel sendes, slik at den ikke går tapt
 * hvis Resend feiler eller er nede.
 * @returns {string} id
 */
export async function lagreFeedback(melding) {
  const result = await pool.query(
    `INSERT INTO feedback (message) VALUES ($1) RETURNING id`,
    [melding],
  );
  return result.rows[0].id;
}
