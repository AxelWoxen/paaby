import pool from '../../backend/db/pool.mjs';
import { utledTags } from '../../js/application/tags.js';
import { agentensValg, merkUtfall } from '../core/interesse.js';

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
      id,
      legacy_id,
      payload,
      status,
      source,
      submitter_name,
      submitter_org,
      submitter_contact,
      submitter_note,
      possible_duplicate,
      duplicate_hint,
      interest_score,
      interest_reasons,
      missing_fields,
      kept_out_reason,
      included_manually,
      image_filled_fields,
      reject_reason,
      reviewed_at,
      (
        SELECT COALESCE(array_agg(DISTINCT s.provider), ARRAY[]::text[])
        FROM event_sources s
        WHERE s.candidate_id = c.id
      ) AS providers,
      c.created_at
    FROM event_candidates c
    ORDER BY c.created_at ASC
  `);

  // Ekte avslag som lærer agenten noe (samme regel som merkUtfall): avgjør
  // om lav score kan legge et funn i «Ikke valgt» (MIN_AVSLAG_FOR_BORTVALG).
  const antallAvslag = result.rows.filter((row) => merkUtfall({
    status: row.status,
    rejectReason: row.reject_reason,
    reviewedAt: row.reviewed_at,
    start: row.payload?.start,
  }) === 'negativ').length;

  return result.rows.map((row) => ({
    ...row.payload,
    id: row.legacy_id,
    _dbId: row.id,
    _status: tilLegacyStatus(row.status),
    _kilde: row.source,
    _innsenderNavn: row.submitter_name,
    _innsenderOrg: row.submitter_org,
    _innsenderKontakt: row.submitter_contact,
    _innsenderNotat: row.submitter_note,
    _muligDuplikat: row.possible_duplicate,
    _duplikatHint: row.duplicate_hint,
    _interesse: row.interest_score,
    _interesseGrunner: row.interest_reasons ?? [],
    _mangler: row.missing_fields ?? [],
    _holdtUte: row.kept_out_reason,
    _inkludertManuelt: row.included_manually,
    // Felt agenten leste fra eventbildet (core/bildeleser.js) — vises som
    // «Fra bilde» i review, så en person dobbeltsjekker dem.
    _fraBilde: row.image_filled_fields ?? [],
    // Agentens gruppe i Fra API (valgt / usikker / ikke-valgt) — regnet ut
    // her, så admin-UI og kjøringsloggen alltid bruker samme grenser.
    _agentValg: agentensValg({
      score: row.interest_score,
      holdtUte: row.kept_out_reason,
      inkludertManuelt: row.included_manually,
      antallAvslag,
    }),
    _providere: row.providers,
    // Når kandidaten kom inn i systemet — adminlistene sorterer «nyeste
    // lagt til» på denne.
    _lagtTil: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  }));
}

// Interne _-felt (status, kilde, innsenderdata, duplikat-varsel, agentens
// vurdering) hører hjemme i egne kolonner, ikke i payload — fjernes før
// lagring. Én implementasjon, slik at et nytt _-felt aldri lekker inn i
// payload bare fordi én av destruktureringene glemte det.
export function utenInterneFelt(event) {
  return Object.fromEntries(
    Object.entries(event ?? {}).filter(([nøkkel]) => !nøkkel.startsWith('_')),
  );
}

// Append-only logg (candidate_decisions, se 012_collector_laering.sql).
// Tar med agentens score og evt. holdt-ute-grunn slik de stod da personen
// bestemte seg — grunnlaget for å måle om agenten faktisk blir bedre.
async function loggBeslutning(client, candidateId, decision, { grunn = null, brukerId = null } = {}) {
  await client.query(
    `
      INSERT INTO candidate_decisions (
        candidate_id, decision, reason, interest_score, kept_out_reason, decided_by
      )
      SELECT id, $2, $3, interest_score, kept_out_reason, $4
      FROM event_candidates
      WHERE id = $1
    `,
    [candidateId, decision, grunn, brukerId],
  );
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
      const { _status, _lagtTil, ...payload } = event;

      // Automatiske tags (daytime/evening/late-evening fra starttid, "free"
      // fra pris når den er entydig) settes allerede her, slik at nye
      // candidates ikke dukker opp i review uten dem.
      payload.tags = utledTags(payload.tags, {
        pris: payload.pris,
        start: payload.start,
      });

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
  // Samme automatiske tag-regel som ved opprettelse — overstyrer alltid
  // tidstag, og "free" når prisen er entydig (ellers admins eget valg).
  const endeligPayload = {
    ...payload,
    tags: utledTags(payload.tags, {
      pris: payload.pris,
      start: payload.start,
    }),
  };

  const result = await pool.query(
    `
      UPDATE event_candidates
      SET payload = $2::jsonb
      WHERE legacy_id = $1
      RETURNING id
    `,
    [legacyId, JSON.stringify(endeligPayload)],
  );

  return {
    ok: result.rowCount > 0,
    tags: endeligPayload.tags,
  };
}

// Marker candidate som godkjent og koble den til publisert event. Kobler
// samtidig evt. event_sources-rad(er) for denne candidaten til det
// publiserte eventet — candidate_id beholdes som provenance, se
// 009_external_source_identity.sql.
export async function markerGodkjent(
  legacyId,
  publishedEventId,
  { brukerId = null } = {},
) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query(
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

    if (result.rowCount > 0) {
      await client.query(
        `UPDATE event_sources SET event_id = $2 WHERE candidate_id = $1`,
        [result.rows[0].id, publishedEventId],
      );
      await loggBeslutning(client, result.rows[0].id, 'approved', { brukerId });
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

// Setter inn ÉN candidate og returnerer dens UUID — brukes av kilde-synk-
// flyten (collector/store/external-event-refs.js:opprettCandidateOgRef),
// som trenger id-en med én gang for å kunne koble en event_sources-rad til
// den. Tar en ALLEREDE ÅPEN transaksjons-client — selve transaksjonen eies
// av kalleren, slik at candidate + ref alltid lagres atomisk sammen.
export async function leggTilEnCandidateMedClient(
  client,
  event,
  { source = 'collector', muligDuplikat = false, duplikatHint = null, vurdering = null } = {},
) {
  const payload = utenInterneFelt(event);
  payload.tags = utledTags(payload.tags, {
    pris: payload.pris,
    start: payload.start,
  });

  // vurdering = agentens syn på eventet da det ble funnet (run.js) — null
  // for alt som ikke kommer fra en collector-kjøring.
  const result = await client.query(
    `
      INSERT INTO event_candidates (
        legacy_id, payload, status, source, possible_duplicate, duplicate_hint,
        collector_run_id, interest_score, interest_reasons, missing_fields, kept_out_reason
      )
      VALUES ($1, $2::jsonb, 'pending', $3, $4, $5, $6, $7, $8::jsonb, $9, $10)
      ON CONFLICT (legacy_id) DO NOTHING
      RETURNING id
    `,
    [
      event.id, JSON.stringify(payload), source, muligDuplikat, duplikatHint,
      vurdering?.runId ?? null,
      vurdering?.score ?? null,
      JSON.stringify(vurdering?.grunner ?? []),
      vurdering?.mangler ?? [],
      vurdering?.holdtUte ?? null,
    ],
  );

  if (result.rowCount > 0) {
    return { id: result.rows[0].id, lagtTil: true };
  }

  // Fantes allerede (samme legacy_id, f.eks. fra en tidligere kilde-run) —
  // hent id-en som faktisk står der, slik at kalleren fortsatt kan koble en
  // ref til den.
  const eksisterende = await client.query(
    `SELECT id FROM event_candidates WHERE legacy_id = $1`,
    [event.id],
  );
  return { id: eksisterende.rows[0]?.id ?? null, lagtTil: false };
}

// Marker candidate som triagert — sendt fra "Fra API" til "Til vurdering".
// IKKE publisering: samme som avslå/godkjenn er dette et statusskifte, ikke
// et nytt sett med sideeffekter.
// Legg et ventende collector-funn i agentens utvalg manuelt (fra «Usikre»
// eller «Ikke valgt»). Fjerner evt. holdt-ute-grunn, og included_manually
// gjør at senere kjøringer aldri holder det ute igjen. Logges, så vi kan
// se hvor ofte agenten tok feil.
export async function markerInkludert(legacyId, { brukerId = null } = {}) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Beslutningen logges FØR raden endres, så loggen viser agentens
    // vurdering slik den var da personen overstyrte den.
    const { rows } = await client.query(
      `SELECT id FROM event_candidates WHERE legacy_id = $1 AND status = 'pending'`,
      [legacyId],
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return false;
    }

    await loggBeslutning(client, rows[0].id, 'included', { brukerId });
    await client.query(
      `
        UPDATE event_candidates
        SET included_manually = TRUE, kept_out_reason = NULL
        WHERE id = $1
      `,
      [rows[0].id],
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

export async function markerTriagert(legacyId, { brukerId = null } = {}) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query(
      `
        UPDATE event_candidates
        SET status = 'triaged'
        WHERE legacy_id = $1 AND status = 'pending'
        RETURNING id
      `,
      [legacyId],
    );

    if (result.rowCount > 0) {
      await loggBeslutning(client, result.rows[0].id, 'triaged', { brukerId });
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

// Marker candidate som avslått. Sletter samtidig et evt. opplastet bilde
// (candidate_images) — avslåtte innsendinger skal ikke fortsette å ligge
// tilgjengelig på /api/bilder/:id.
//
// grunn (se AVSLAGSGRUNNER i core/interesse.js) lagres både på raden og i
// candidate_decisions — «duplikat»/«passert» skal ikke lære agenten at
// eventet var uinteressant.
export async function markerAvslatt(legacyId, { grunn = null, brukerId = null } = {}) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query(
      `
        UPDATE event_candidates
        SET
          status = 'rejected',
          reviewed_at = NOW(),
          reject_reason = $2
        WHERE legacy_id = $1
        RETURNING id
      `,
      [legacyId, grunn],
    );

    if (result.rowCount > 0) {
      await client.query(
        `DELETE FROM candidate_images WHERE candidate_id = $1`,
        [result.rows[0].id],
      );
      await loggBeslutning(client, result.rows[0].id, 'rejected', { grunn, brukerId });
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