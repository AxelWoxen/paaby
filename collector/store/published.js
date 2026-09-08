import pool from '../../backend/db/pool.mjs';

export async function lesPubliserte() {
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
      e.featured AS fremhevet,

      (e.status = 'inactive') AS deaktivert

    FROM events e

    JOIN event_occurrences o
      ON o.event_id = e.id

    LEFT JOIN venues v
      ON v.id = e.venue_id

    LEFT JOIN event_categories ec
      ON ec.event_id = e.id

    ORDER BY o.starts_at ASC
  `);

  return result.rows.map((event) => ({
  ...event,
  start:
    event.start instanceof Date
      ? event.start.toISOString()
      : event.start,

  slutt:
    event.slutt instanceof Date
      ? event.slutt.toISOString()
      : event.slutt,

  sistVerifisert:
    event.sistVerifisert instanceof Date
      ? event.sistVerifisert.toISOString()
      : event.sistVerifisert,
}));
}

function lagSlug(tekst) {
  return tekst
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function publiserEvent(
  event,
  {
    kuratortekst = null,
    fremhevet = false,
    gjentas = null,
  } = {},
) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Venue
    let venueId = null;

    if (event.sted) {
      const slug = lagSlug(event.sted);

      const venueResult = await client.query(
        `
          INSERT INTO venues (
            slug,
            name,
            address,
            latitude,
            longitude
          )
          VALUES ($1, $2, $3, $4, $5)

          ON CONFLICT (slug)
          DO UPDATE SET
            name = EXCLUDED.name,
            address = COALESCE(EXCLUDED.address, venues.address),
            latitude = COALESCE(EXCLUDED.latitude, venues.latitude),
            longitude = COALESCE(EXCLUDED.longitude, venues.longitude)

          RETURNING id
        `,
        [
          slug,
          event.sted,
          event.adresse ?? null,
          event.lat ?? null,
          event.lng ?? null,
        ],
      );

      venueId = venueResult.rows[0].id;
    }

    // 2. Event
    const eventResult = await client.query(
      `
        INSERT INTO events (
          legacy_id,
          title,
          description,
          curator_text,
          venue_id,
          event_url,
          image_url,
          price_nok,
          price_text,
          recurrence_rule_raw,
          featured,
          last_verified_at,
          status
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, NOW(), 'active'
        )

        ON CONFLICT (legacy_id)
        DO UPDATE SET
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          curator_text = EXCLUDED.curator_text,
          venue_id = EXCLUDED.venue_id,
          event_url = EXCLUDED.event_url,
          image_url = EXCLUDED.image_url,
          price_nok = EXCLUDED.price_nok,
          price_text = EXCLUDED.price_text,
          recurrence_rule_raw = EXCLUDED.recurrence_rule_raw,
          featured = EXCLUDED.featured,
          last_verified_at = NOW(),
          status = 'active'

        RETURNING id
      `,
      [
        event.id,
        event.tittel,
        event.beskrivelse ?? null,
        kuratortekst?.trim() || null,
        venueId,
        event.lenke ?? null,
        event.bilde ?? null,
        event.pris ?? null,
        event.prisTekst ?? null,
        gjentas || null,
        fremhevet === true,
      ],
    );

    const eventId = eventResult.rows[0].id;

    // 3. Kategori
    if (event.kategori) {
      await client.query(
        `
          INSERT INTO event_categories (
            event_id,
            category_slug
          )
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING
        `,
        [eventId, event.kategori],
      );
    }

    // 4. Første forekomst
    if (!event.start) {
      throw new Error('Event mangler starttidspunkt');
    }

    await client.query(
      `
        INSERT INTO event_occurrences (
          event_id,
          starts_at,
          ends_at,
          status
        )
        VALUES ($1, $2, $3, 'scheduled')

        ON CONFLICT (event_id, starts_at)
        DO UPDATE SET
          ends_at = EXCLUDED.ends_at,
          status = 'scheduled'
      `,
      [
        eventId,
        event.start,
        event.slutt ?? null,
      ],
    );

    await client.query('COMMIT');

    return eventId;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function toggleFremhevet(id) {
  const result = await pool.query(
    `
      UPDATE events
      SET featured = NOT featured
      WHERE legacy_id = $1
      RETURNING featured
    `,
    [id],
  );

  if (result.rowCount === 0) {
    return null;
  }

  return result.rows[0].featured;
}

export async function toggleDeaktivert(id) {
  const result = await pool.query(
    `
      UPDATE events
      SET status =
        CASE
          WHEN status = 'inactive' THEN 'active'
          ELSE 'inactive'
        END
      WHERE legacy_id = $1
        AND status IN ('active', 'inactive')
      RETURNING status
    `,
    [id],
  );

  if (result.rowCount === 0) {
    return null;
  }

  return result.rows[0].status === 'inactive';
}

export async function oppdaterPublisertEvent(id, data) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const eksisterende = await client.query(
      `
        SELECT id
        FROM events
        WHERE legacy_id = $1
      `,
      [id],
    );

    if (eksisterende.rowCount === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const eventId = eksisterende.rows[0].id;

    // Venue
    let venueId = null;

    if (data.sted) {
      const slug = lagSlug(data.sted);

      const venueResult = await client.query(
        `
          INSERT INTO venues (
            slug, name, address, latitude, longitude
          )
          VALUES ($1, $2, $3, $4, $5)

          ON CONFLICT (slug)
          DO UPDATE SET
            name = EXCLUDED.name,
            address = EXCLUDED.address,
            latitude = EXCLUDED.latitude,
            longitude = EXCLUDED.longitude

          RETURNING id
        `,
        [
          slug,
          data.sted,
          data.adresse ?? null,
          data.lat ?? null,
          data.lng ?? null,
        ],
      );

      venueId = venueResult.rows[0].id;
    }

    // Event-data
    await client.query(
      `
        UPDATE events
        SET
          title = $1,
          venue_id = $2,
          price_nok = $3,
          price_text = $4,
          description = $5,
          curator_text = $6,
          event_url = $7,
          image_url = $8,
          last_verified_at = NOW()
        WHERE id = $9
      `,
      [
        data.tittel,
        venueId,
        data.pris ?? null,
        data.prisTekst ?? null,
        data.beskrivelse ?? null,
        data.kuratortekst ?? null,
        data.lenke ?? null,
        data.bilde ?? null,
        eventId,
      ],
    );

    // Kategori
    await client.query(
      `DELETE FROM event_categories WHERE event_id = $1`,
      [eventId],
    );

    if (data.kategori) {
      await client.query(
        `
          INSERT INTO event_categories (event_id, category_slug)
          VALUES ($1, $2)
        `,
        [eventId, data.kategori],
      );
    }

    // Tidspunkt
    await client.query(
      `
        UPDATE event_occurrences
        SET
          starts_at = $1,
          ends_at = $2
        WHERE event_id = $3
      `,
      [
        data.start,
        data.slutt ?? null,
        eventId,
      ],
    );

    await client.query('COMMIT');

    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function oppdaterGjentas(id, gjentas) {
  const result = await pool.query(
    `
      UPDATE events
      SET
        recurrence_rule_raw = $2,
        last_verified_at = NOW()
      WHERE legacy_id = $1
      RETURNING recurrence_rule_raw
    `,
    [
      id,
      gjentas?.trim() || null,
    ],
  );

  if (result.rowCount === 0) {
    return {
      funnet: false,
      gjentas: null,
    };
  }

  return {
    funnet: true,
    gjentas: result.rows[0].recurrence_rule_raw,
  };
}