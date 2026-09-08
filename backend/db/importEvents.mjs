import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import pool from './pool.mjs';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EVENTS_FILE = path.resolve(
  __dirname,
  '../../data/events.json'
);


function lagSlug(tekst) {
  return tekst
    .toLowerCase()
    .replaceAll('æ', 'ae')
    .replaceAll('ø', 'o')
    .replaceAll('å', 'a')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}


function normaliserBilde(bilde) {
  if (!bilde) {
    return null;
  }

  // Vi vil ikke lagre enorme base64-bilder direkte i databasen.
  if (bilde.startsWith('data:image/')) {
    return null;
  }

  return bilde;
}


async function importerEvents() {
  const json = await fs.readFile(EVENTS_FILE, 'utf8');
  const events = JSON.parse(json);

  const client = await pool.connect();

  let importert = 0;
  let hoppetOver = 0;

  try {
    await client.query('BEGIN');

    for (const event of events) {

      // Mat skal ikke være en Påby-kategori fremover.
      if (event.kategori === 'mat') {
        console.log(`Hopper over mat-event: ${event.tittel}`);
        hoppetOver++;
        continue;
      }

      const gyldigeKategorier = [
        'musikk',
        'klubb',
        'pafunn'
      ];

      if (!gyldigeKategorier.includes(event.kategori)) {
        console.log(
          `Ukjent kategori "${event.kategori}", hopper over: ${event.tittel}`
        );

        hoppetOver++;
        continue;
      }


      // -----------------------------------------
      // VENUE
      // -----------------------------------------

      const venueSlug = lagSlug(event.sted);

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
            address = COALESCE(
              venues.address,
              EXCLUDED.address
            ),
            latitude = COALESCE(
              venues.latitude,
              EXCLUDED.latitude
            ),
            longitude = COALESCE(
              venues.longitude,
              EXCLUDED.longitude
            )

          RETURNING id
        `,
        [
          venueSlug,
          event.sted,
          event.adresse ?? null,
          event.lat ?? null,
          event.lng ?? null
        ]
      );

      const venueId = venueResult.rows[0].id;


      // -----------------------------------------
      // EVENT
      // -----------------------------------------

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
            $8, $9, $10, $11, $12, $13
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
            last_verified_at = EXCLUDED.last_verified_at,
            status = EXCLUDED.status

          RETURNING id
        `,
        [
          event.id,
          event.tittel,
          event.beskrivelse ?? null,
          event.kuratortekst ?? null,
          venueId,
          event.lenke ?? null,
          normaliserBilde(event.bilde),
          event.pris ?? null,
          event.prisTekst ?? null,
          event.gjentas ?? null,
          event.fremhevet ?? false,
          event.sistVerifisert ?? null,
          event.deaktivert ? 'inactive' : 'active'
        ]
      );

      const eventId = eventResult.rows[0].id;


      // -----------------------------------------
      // CATEGORY
      // -----------------------------------------

      await client.query(
        `
          INSERT INTO event_categories (
            event_id,
            category_slug
          )
          VALUES ($1, $2)

          ON CONFLICT DO NOTHING
        `,
        [
          eventId,
          event.kategori
        ]
      );


      // -----------------------------------------
      // OCCURRENCE
      // -----------------------------------------

      await client.query(
        `
          INSERT INTO event_occurrences (
            event_id,
            starts_at,
            ends_at
          )
          VALUES ($1, $2, $3)

          ON CONFLICT (event_id, starts_at)
          DO UPDATE SET
            ends_at = EXCLUDED.ends_at
        `,
        [
          eventId,
          event.start,
          event.slutt ?? null
        ]
      );

      importert++;
    }

    await client.query('COMMIT');

    console.log('');
    console.log('Import ferdig.');
    console.log(`Importert: ${importert}`);
    console.log(`Hoppet over: ${hoppetOver}`);

  } catch (error) {
    await client.query('ROLLBACK');

    console.error('Import feilet:');
    console.error(error);

    process.exitCode = 1;

  } finally {
    client.release();
    await pool.end();
  }
}


importerEvents();