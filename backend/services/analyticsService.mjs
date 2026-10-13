// analyticsService.mjs — første-parts produktanalyse (Innsikt).
//
// Datamin.-prinsipp: INGEN IP, User-Agent, eksakt posisjon, fingerprinting,
// navn eller e-post lagres her, noe sted. visitor_id/session_id er
// tilfeldige UUID-er generert av klienten (se
// js/application/analyse-identitet.js) — serveren stoler på formatet
// (validert under), men tilfører aldri identifiserende data selv.
//
// Server setter alltid created_at/last_seen/last_seen_at — klient-tidspunkt
// er ikke sannhet (se oppgavens DEL 4).

import pool from '../db/pool.mjs';
import {
  ANALYTICS_EVENT_NAVN,
  erGyldigAnalyticsEventNavn,
  utledBaseEventId,
} from '../../js/application/analytics-events.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const GYLDIGE_PLATFORMER = new Set(['web', 'ios', 'android']);

const MAKS_EVENT_ID_LENGDE = 300;
const MAKS_CATEGORY_LENGDE = 40;
const MAKS_UTM_LENGDE = 100;
const MAKS_REFERRER_HOST_LENGDE = 255;
const MAKS_PAYLOAD_BYTES = 4096;

// Eneste tillatte properties-nøkler — "filter_valgt" er i dag det eneste
// event-navnet som faktisk har properties. Alt annet strippes stille, i
// stedet for å avvise hele requesten (en avdatert klient skal ikke knekke).
const TILLATTE_PROPERTY_NOKLER = new Set(['type', 'verdi']);
const MAKS_PROPERTY_VERDI_LENGDE = 60;

function erGyldigUuid(verdi) {
  return typeof verdi === 'string' && UUID_REGEX.test(verdi);
}

function tekstEllerNull(verdi, maksLengde) {
  if (typeof verdi !== 'string') return null;
  const trimmet = verdi.trim();
  if (!trimmet) return null;
  return trimmet.slice(0, maksLengde);
}

function forStorPayload(body) {
  try {
    return Buffer.byteLength(JSON.stringify(body ?? {}), 'utf8') > MAKS_PAYLOAD_BYTES;
  } catch {
    return true;
  }
}

function rensProperties(properties) {
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return {};

  const renset = {};
  for (const [nokkel, verdi] of Object.entries(properties)) {
    if (!TILLATTE_PROPERTY_NOKLER.has(nokkel)) continue;
    if (typeof verdi !== 'string' && typeof verdi !== 'number' && typeof verdi !== 'boolean') continue;
    renset[nokkel] = String(verdi).slice(0, MAKS_PROPERTY_VERDI_LENGDE);
  }
  return renset;
}


// ─── Validering ─────────────────────────────────────────────────────────────

/** @returns {{ feil: string }|{ visitorId, sessionId, platform, utmSource, utmMedium, utmCampaign, referrerHost }} */
export function validerSessionBody(body) {
  if (forStorPayload(body)) return { feil: 'Forespørselen er for stor' };

  const { visitor_id, session_id, platform, utm_source, utm_medium, utm_campaign, referrer_host } = body ?? {};

  if (!erGyldigUuid(visitor_id)) return { feil: 'Ugyldig visitor_id' };
  if (!erGyldigUuid(session_id)) return { feil: 'Ugyldig session_id' };

  const platformVerdi = typeof platform === 'string' ? platform : 'web';
  if (!GYLDIGE_PLATFORMER.has(platformVerdi)) return { feil: 'Ugyldig platform' };

  return {
    visitorId: visitor_id,
    sessionId: session_id,
    platform: platformVerdi,
    utmSource: tekstEllerNull(utm_source, MAKS_UTM_LENGDE),
    utmMedium: tekstEllerNull(utm_medium, MAKS_UTM_LENGDE),
    utmCampaign: tekstEllerNull(utm_campaign, MAKS_UTM_LENGDE),
    referrerHost: tekstEllerNull(referrer_host, MAKS_REFERRER_HOST_LENGDE),
  };
}

/** @returns {{ feil: string }|{ visitorId, sessionId, eventName, eventId, category, properties }} */
export function validerEventBody(body) {
  if (forStorPayload(body)) return { feil: 'Forespørselen er for stor' };

  const { visitor_id, session_id, event_name, event_id, category, properties } = body ?? {};

  if (!erGyldigUuid(visitor_id)) return { feil: 'Ugyldig visitor_id' };
  if (!erGyldigUuid(session_id)) return { feil: 'Ugyldig session_id' };
  if (!erGyldigAnalyticsEventNavn(event_name)) return { feil: 'Ukjent event_name' };

  return {
    visitorId: visitor_id,
    sessionId: session_id,
    eventName: event_name,
    eventId: tekstEllerNull(event_id, MAKS_EVENT_ID_LENGDE),
    category: tekstEllerNull(category, MAKS_CATEGORY_LENGDE),
    properties: rensProperties(properties),
  };
}

const MAKS_SAVED_SYNC_ANTALL = 500;

/** @returns {{ feil: string }|{ visitorId, eventIds: string[] }} */
export function validerSavedSyncBody(body) {
  if (forStorPayload(body)) return { feil: 'Forespørselen er for stor' };

  const { visitor_id, event_ids } = body ?? {};

  if (!erGyldigUuid(visitor_id)) return { feil: 'Ugyldig visitor_id' };
  if (!Array.isArray(event_ids)) return { feil: 'event_ids må være en liste' };
  if (event_ids.length > MAKS_SAVED_SYNC_ANTALL) return { feil: 'For mange event_ids' };

  const eventIds = [...new Set(
    event_ids
      .filter((id) => typeof id === 'string' && id.trim().length > 0)
      .map((id) => id.trim().slice(0, MAKS_EVENT_ID_LENGDE)),
  )];

  return { visitorId: visitor_id, eventIds };
}


// ─── Skriving ───────────────────────────────────────────────────────────────

async function upsertVisitor(client, visitorId) {
  await client.query(
    `
      INSERT INTO analytics_visitors (visitor_id, first_seen, last_seen)
      VALUES ($1, NOW(), NOW())
      ON CONFLICT (visitor_id)
      DO UPDATE SET last_seen = NOW()
    `,
    [visitorId],
  );
}

export async function registrerSession({ visitorId, sessionId, platform, utmSource, utmMedium, utmCampaign, referrerHost }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await upsertVisitor(client, visitorId);

    await client.query(
      `
        INSERT INTO analytics_sessions (
          session_id, visitor_id, started_at, last_seen_at,
          platform, utm_source, utm_medium, utm_campaign, referrer_host
        )
        VALUES ($1, $2, NOW(), NOW(), $3, $4, $5, $6, $7)

        ON CONFLICT (session_id)
        DO UPDATE SET last_seen_at = NOW()
      `,
      [sessionId, visitorId, platform, utmSource, utmMedium, utmCampaign, referrerHost],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Kastes når en event refererer til en session som ikke finnes (f.eks.
// desynket klienttilstand) — controller svarer 400, men klienten venter
// aldri på svaret (fire-and-forget), så dette er kun til logging/tester.
export class UkjentSessionError extends Error {}

export async function registrerEvent({ visitorId, sessionId, eventName, eventId, category, properties }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await upsertVisitor(client, visitorId);

    const sessionOppdatering = await client.query(
      `UPDATE analytics_sessions SET last_seen_at = NOW() WHERE session_id = $1 AND visitor_id = $2`,
      [sessionId, visitorId],
    );
    if (sessionOppdatering.rowCount === 0) {
      throw new UkjentSessionError(`Ukjent session_id/visitor_id-kombinasjon: ${sessionId}`);
    }

    const baseEventId = eventId ? utledBaseEventId(eventId) : null;

    await client.query(
      `
        INSERT INTO analytics_events (
          visitor_id, session_id, event_name, event_id, base_event_id, category, properties, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      `,
      [visitorId, sessionId, eventName, eventId, baseEventId, category, JSON.stringify(properties ?? {})],
    );

    // Saved-state er STATE, ikke eventlogg — holdes i sync i samme
    // transaksjon som selve hendelsen logges (se 008_analytics.sql).
    if (eventName === 'event_lagret' && eventId) {
      await client.query(
        `
          INSERT INTO analytics_saved_events (visitor_id, event_id, base_event_id, saved_at)
          VALUES ($1, $2, $3, NOW())
          ON CONFLICT (visitor_id, event_id)
          DO UPDATE SET saved_at = NOW(), base_event_id = EXCLUDED.base_event_id
        `,
        [visitorId, eventId, baseEventId],
      );
    } else if (eventName === 'event_fjernet_lagret' && eventId) {
      await client.query(
        `DELETE FROM analytics_saved_events WHERE visitor_id = $1 AND event_id = $2`,
        [visitorId, eventId],
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Seeder analytics_saved_events med brukerens EKSISTERENDE localStorage-
// lagringer. Additiv og idempotent — overskriver aldri saved_at for rader
// som allerede finnes, og sletter aldri noe (localStorage er fortsatt source
// of truth for selve lagre/fjern-funksjonaliteten, se oppgavens DEL 4).
export async function synkroniserLagrede({ visitorId, eventIds }) {
  if (eventIds.length === 0) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await upsertVisitor(client, visitorId);

    for (const eventId of eventIds) {
      const baseEventId = utledBaseEventId(eventId);
      await client.query(
        `
          INSERT INTO analytics_saved_events (visitor_id, event_id, base_event_id, saved_at)
          VALUES ($1, $2, $3, NOW())
          ON CONFLICT (visitor_id, event_id) DO NOTHING
        `,
        [visitorId, eventId, baseEventId],
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export { ANALYTICS_EVENT_NAVN };
