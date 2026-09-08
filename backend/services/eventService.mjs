import pool from '../db/pool.mjs';

export async function getAllEvents() {
  const result = await pool.query(`
    SELECT
      e.legacy_id AS id,
      e.title AS tittel,

      ec.category_slug AS kategori,

      v.name AS sted,
      v.address AS adresse,
      v.latitude AS lat,
      v.longitude AS lng,

      o.starts_at AS start,
      o.ends_at AS slutt,

      e.price_nok AS pris,
      e.price_text AS "prisTekst",

      e.description AS beskrivelse,
      e.curator_text AS kuratortekst,

      e.event_url AS lenke,
      e.image_url AS bilde,

      e.last_verified_at AS "sistVerifisert",
      e.recurrence_rule_raw AS gjentas,
      e.featured AS fremhevet

    FROM events e

    JOIN event_occurrences o
      ON o.event_id = e.id

    LEFT JOIN venues v
      ON v.id = e.venue_id

    LEFT JOIN event_categories ec
      ON ec.event_id = e.id

    WHERE e.status = 'active'
      AND o.status = 'scheduled'

    ORDER BY o.starts_at ASC
  `);

  return result.rows;
}