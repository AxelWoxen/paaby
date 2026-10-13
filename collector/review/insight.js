// insight.js — server-side aggregering for «Innsikt»-fanen i Påby Admin.
//
// All aggregering skjer i PostgreSQL/her — admin-UI-et henter ETT ferdig
// JSON-objekt (se server.js: GET /api/innsikt), det henter aldri rå
// analytics-rader for å telle i browseren (oppgavens DEL 7).
//
// Metrikk-prinsipp (DEL 8): produktinteresse måles med COUNT(DISTINCT
// visitor_id), ikke totalt antall hendelser — én bruker som åpner samme
// event 20 ganger skal ikke telle som 20 "åpnere".
//
// base_event_id kobles mot events.legacy_id (IKKE events.id/UUID) — se
// backend/services/eventService.mjs/published.js: frontendens event.id ER
// legacy_id. Gjentakende forekomster (base__YYYY-MM-DD) rulles dermed opp
// til grunn-eventet i topEvents/categories/tags.

import pool from '../../backend/db/pool.mjs';

const EN_DAG_MS = 24 * 60 * 60 * 1000;
const DAGER_PER_PERIODE = { 7: 7, 30: 30, 90: 90 };
const GYLDIGE_PERIODER = new Set(['7', '30', '90', 'alt']);

// Under denne terskelen anses et tall som for usikkert til å tolkes som en
// meningsfull prosentandel (se oppgavens DEL 1I/13). Bevisst, dokumentert
// valg — ikke en beregnet statistisk grense.
const MIN_UTVALG_FOR_RATE = 20;

export function tolkPeriode(raw) {
  return GYLDIGE_PERIODER.has(raw) ? raw : '7';
}

async function beregnPerioder(periode) {
  const periodeSlutt = new Date();

  let periodeStart;
  if (periode === 'alt') {
    const { rows } = await pool.query(`SELECT MIN(created_at) AS forste FROM analytics_events`);
    periodeStart = rows[0].forste ?? periodeSlutt;
  } else {
    periodeStart = new Date(periodeSlutt.getTime() - DAGER_PER_PERIODE[periode] * EN_DAG_MS);
  }

  let forrigeStart = null;
  let forrigeSlutt = null;
  if (periode !== 'alt') {
    const lengdeMs = periodeSlutt.getTime() - periodeStart.getTime();
    forrigeSlutt = periodeStart;
    forrigeStart = new Date(periodeStart.getTime() - lengdeMs);
  }

  return { periodeStart, periodeSlutt, forrigeStart, forrigeSlutt };
}

function rate(teller, nevner) {
  if (!nevner) return null;
  return Math.round((teller / nevner) * 1000) / 10; // én desimal
}

function deltaPct(naVerdi, forrigeVerdi) {
  // Misvisende å vise prosentendring fra 0 — vis "–" (null) i stedet
  // (oppgavens DEL 1A).
  if (forrigeVerdi === null || forrigeVerdi === undefined || forrigeVerdi === 0) return null;
  return Math.round(((naVerdi - forrigeVerdi) / forrigeVerdi) * 1000) / 10;
}


// ─── A. Summary (KPI-kort) + B. Funnel ─────────────────────────────────────

async function hentSummaryTall(start, slutt) {
  const { rows } = await pool.query(
    `
      SELECT
        (SELECT COUNT(DISTINCT visitor_id) FROM analytics_sessions
          WHERE last_seen_at BETWEEN $1 AND $2) AS unike_brukere,

        (SELECT COUNT(*) FROM analytics_visitors
          WHERE first_seen BETWEEN $1 AND $2) AS nye_brukere,

        (SELECT COUNT(DISTINCT s.visitor_id) FROM analytics_sessions s
          JOIN analytics_visitors v ON v.visitor_id = s.visitor_id
          WHERE s.last_seen_at BETWEEN $1 AND $2 AND v.first_seen < $1) AS tilbakevendende,

        (SELECT COUNT(*) FROM analytics_sessions
          WHERE started_at BETWEEN $1 AND $2) AS sessions,

        (SELECT COUNT(DISTINCT visitor_id) FROM analytics_events
          WHERE event_name = 'kort_åpnet' AND created_at BETWEEN $1 AND $2) AS eventaapnere,

        (SELECT COUNT(DISTINCT visitor_id) FROM analytics_events
          WHERE event_name = 'event_lagret' AND created_at BETWEEN $1 AND $2) AS lagrere,

        (SELECT COUNT(DISTINCT visitor_id) FROM analytics_events
          WHERE event_name = 'mer_info_klikket' AND created_at BETWEEN $1 AND $2) AS videreklikk,

        (SELECT COUNT(DISTINCT visitor_id) FROM analytics_events
          WHERE event_name = 'event_delt' AND created_at BETWEEN $1 AND $2) AS delere
    `,
    [start, slutt],
  );

  const r = rows[0];
  return {
    unikeBrukere: Number(r.unike_brukere),
    nyeBrukere: Number(r.nye_brukere),
    tilbakevendende: Number(r.tilbakevendende),
    sessions: Number(r.sessions),
    eventaapnere: Number(r.eventaapnere),
    lagrere: Number(r.lagrere),
    videreklikk: Number(r.videreklikk),
    delere: Number(r.delere),
  };
}

async function hentHarLagretNa() {
  const { rows } = await pool.query(`SELECT COUNT(DISTINCT visitor_id) AS antall FROM analytics_saved_events`);
  return Number(rows[0].antall);
}

function byggKpi(navn, na, forrige) {
  return { navn, verdi: na, forrigeVerdi: forrige, endringPct: deltaPct(na, forrige) };
}

async function hentSummary(perioder) {
  const { periodeStart, periodeSlutt, forrigeStart, forrigeSlutt } = perioder;

  const [naTall, forrigeTall, harLagretNa] = await Promise.all([
    hentSummaryTall(periodeStart, periodeSlutt),
    forrigeStart ? hentSummaryTall(forrigeStart, forrigeSlutt) : null,
    hentHarLagretNa(),
  ]);

  const f = forrigeTall ?? {};

  return {
    unikeBrukere: byggKpi('Unike brukere', naTall.unikeBrukere, f.unikeBrukere ?? null),
    nyeBrukere: byggKpi('Nye brukere', naTall.nyeBrukere, f.nyeBrukere ?? null),
    tilbakevendende: byggKpi('Tilbakevendende brukere', naTall.tilbakevendende, f.tilbakevendende ?? null),
    sessions: byggKpi('Besøk / sessions', naTall.sessions, f.sessions ?? null),
    eventaapnere: byggKpi('Eventåpnere', naTall.eventaapnere, f.eventaapnere ?? null),
    lagrere: byggKpi('Lagrere', naTall.lagrere, f.lagrere ?? null),
    harLagretNa: { navn: 'Har lagret nå', verdi: harLagretNa, forrigeVerdi: null, endringPct: null },
    videreklikk: byggKpi('Videreklikk', naTall.videreklikk, f.videreklikk ?? null),
    delere: byggKpi('Delere', naTall.delere, f.delere ?? null),

    _naTall: naTall, // internt — brukes av funnel under, ikke del av det offentlige kontraktet
  };
}

function byggFunnel(naTall) {
  const steg = [
    { navn: 'Besøk', antall: naTall.unikeBrukere },
    { navn: 'Åpnet minst ett event', antall: naTall.eventaapnere },
    { navn: 'Lagret minst ett event', antall: naTall.lagrere },
    { navn: 'Klikket videre til arrangør/billett', antall: naTall.videreklikk },
  ];

  return steg.map((s, i) => ({
    navn: s.navn,
    antall: s.antall,
    prosentAvForrige: i === 0 ? null : rate(s.antall, steg[i - 1].antall),
    prosentAvAlle: rate(s.antall, steg[0].antall),
  }));
}


// ─── C. Tidsserie ───────────────────────────────────────────────────────────

async function hentTimeseries(periodeStart, periodeSlutt) {
  const { rows: dagRader } = await pool.query(
    `
      WITH dager AS (
        SELECT generate_series(
          date_trunc('day', $1::timestamptz),
          date_trunc('day', $2::timestamptz),
          interval '1 day'
        )::date AS dag
      ),
      sesjoner AS (
        SELECT date_trunc('day', started_at)::date AS dag,
               COUNT(*) AS sessions,
               COUNT(DISTINCT visitor_id) AS unike_brukere
        FROM analytics_sessions
        WHERE started_at BETWEEN $1 AND $2
        GROUP BY 1
      )
      SELECT
        dager.dag,
        COALESCE(sesjoner.sessions, 0) AS sessions,
        COALESCE(sesjoner.unike_brukere, 0) AS unike_brukere
      FROM dager
      LEFT JOIN sesjoner ON sesjoner.dag = dager.dag
      ORDER BY dager.dag
    `,
    [periodeStart, periodeSlutt],
  );

  const { rows: hendelseRader } = await pool.query(
    `
      SELECT
        date_trunc('day', created_at)::date AS dag,
        event_name,
        COUNT(DISTINCT visitor_id) AS unike
      FROM analytics_events
      WHERE created_at BETWEEN $1 AND $2
        AND event_name IN ('kort_åpnet', 'event_lagret', 'mer_info_klikket')
      GROUP BY 1, 2
    `,
    [periodeStart, periodeSlutt],
  );

  const perDag = new Map();
  for (const r of dagRader) {
    const key = r.dag.toISOString().slice(0, 10);
    perDag.set(key, {
      dato: key,
      unikeBrukere: Number(r.unike_brukere),
      sessions: Number(r.sessions),
      eventaapninger: 0,
      lagringer: 0,
      videreklikk: 0,
    });
  }

  const KOLONNE = { 'kort_åpnet': 'eventaapninger', event_lagret: 'lagringer', mer_info_klikket: 'videreklikk' };
  for (const r of hendelseRader) {
    const key = r.dag.toISOString().slice(0, 10);
    const dagObjekt = perDag.get(key);
    if (dagObjekt) dagObjekt[KOLONNE[r.event_name]] = Number(r.unike);
  }

  return [...perDag.values()];
}


// ─── D. Topp events ─────────────────────────────────────────────────────────

async function hentTopEvents(periodeStart, periodeSlutt) {
  const { rows } = await pool.query(
    `
      WITH perioden AS (
        SELECT
          base_event_id,
          COUNT(DISTINCT visitor_id) FILTER (WHERE event_name = 'kort_åpnet') AS aapnere,
          COUNT(DISTINCT visitor_id) FILTER (WHERE event_name = 'event_lagret') AS lagrere,
          COUNT(DISTINCT visitor_id) FILTER (WHERE event_name = 'mer_info_klikket') AS videreklikk,
          COUNT(DISTINCT visitor_id) FILTER (WHERE event_name = 'event_delt') AS delinger
        FROM analytics_events
        WHERE created_at BETWEEN $1 AND $2
          AND base_event_id IS NOT NULL
        GROUP BY base_event_id
      ),
      aktive AS (
        SELECT base_event_id, COUNT(*) AS aktive_lagringer
        FROM analytics_saved_events
        WHERE base_event_id IS NOT NULL
        GROUP BY base_event_id
      )
      SELECT
        p.base_event_id AS id,
        e.title AS tittel,
        v.name AS sted,
        (SELECT category_slug FROM event_categories WHERE event_id = e.id LIMIT 1) AS kategori,
        p.aapnere, p.lagrere, p.videreklikk, p.delinger,
        COALESCE(a.aktive_lagringer, 0) AS aktive_lagringer_na
      FROM perioden p
      LEFT JOIN events e ON e.legacy_id = p.base_event_id
      LEFT JOIN venues v ON v.id = e.venue_id
      LEFT JOIN aktive a ON a.base_event_id = p.base_event_id
      ORDER BY p.aapnere DESC
      LIMIT 50
    `,
    [periodeStart, periodeSlutt],
  );

  return rows.map((r) => ({
    id: r.id,
    tittel: r.tittel ?? '(ukjent — eventet er ikke i databasen)',
    sted: r.sted,
    kategori: r.kategori,
    aapnere: Number(r.aapnere),
    lagrere: Number(r.lagrere),
    videreklikk: Number(r.videreklikk),
    delinger: Number(r.delinger),
    aktiveLagringerNa: Number(r.aktive_lagringer_na),
    aapningTilLagringPct: rate(Number(r.lagrere), Number(r.aapnere)),
    aapningTilVidereklikkPct: rate(Number(r.videreklikk), Number(r.aapnere)),
  }));
}


// ─── E. Kategorier ──────────────────────────────────────────────────────────

async function hentCategories(periodeStart, periodeSlutt) {
  const { rows } = await pool.query(
    `
      SELECT
        ec.category_slug AS kategori,
        COUNT(DISTINCT ae.visitor_id) FILTER (WHERE ae.event_name = 'kort_åpnet') AS aapnere,
        COUNT(DISTINCT ae.visitor_id) FILTER (WHERE ae.event_name = 'event_lagret') AS lagrere,
        COUNT(DISTINCT ae.visitor_id) FILTER (WHERE ae.event_name = 'mer_info_klikket') AS videreklikk
      FROM analytics_events ae
      JOIN events e ON e.legacy_id = ae.base_event_id
      JOIN event_categories ec ON ec.event_id = e.id
      WHERE ae.created_at BETWEEN $1 AND $2
        AND ae.base_event_id IS NOT NULL
      GROUP BY ec.category_slug
      ORDER BY aapnere DESC
    `,
    [periodeStart, periodeSlutt],
  );

  return rows.map((r) => ({
    kategori: r.kategori,
    aapnere: Number(r.aapnere),
    lagrere: Number(r.lagrere),
    videreklikk: Number(r.videreklikk),
    saveRatePct: rate(Number(r.lagrere), Number(r.aapnere)),
    externalClickRatePct: rate(Number(r.videreklikk), Number(r.aapnere)),
  }));
}


// ─── F. Tags ────────────────────────────────────────────────────────────────

async function hentTags(periodeStart, periodeSlutt) {
  const { rows } = await pool.query(
    `
      SELECT
        et.tag_slug AS tag,
        COUNT(DISTINCT ae.visitor_id) FILTER (WHERE ae.event_name = 'kort_åpnet') AS aapnere,
        COUNT(DISTINCT ae.visitor_id) FILTER (WHERE ae.event_name = 'event_lagret') AS lagrere,
        COUNT(DISTINCT ae.visitor_id) FILTER (WHERE ae.event_name = 'mer_info_klikket') AS videreklikk
      FROM analytics_events ae
      JOIN events e ON e.legacy_id = ae.base_event_id
      JOIN event_tags et ON et.event_id = e.id
      WHERE ae.created_at BETWEEN $1 AND $2
        AND ae.base_event_id IS NOT NULL
      GROUP BY et.tag_slug
      ORDER BY aapnere DESC
    `,
    [periodeStart, periodeSlutt],
  );

  return rows.map((r) => ({
    tag: r.tag,
    aapnere: Number(r.aapnere),
    lagrere: Number(r.lagrere),
    videreklikk: Number(r.videreklikk),
    saveRatePct: rate(Number(r.lagrere), Number(r.aapnere)),
    externalClickRatePct: rate(Number(r.videreklikk), Number(r.aapnere)),
  }));
}


// ─── G. Lagringsdybde ───────────────────────────────────────────────────────

async function hentSaveDistribution(periodeStart, periodeSlutt) {
  const { rows } = await pool.query(
    `
      WITH aktive_brukere AS (
        SELECT DISTINCT visitor_id FROM analytics_sessions
        WHERE last_seen_at BETWEEN $1 AND $2
      ),
      antall_lagret AS (
        SELECT ab.visitor_id, COUNT(se.event_id) AS antall
        FROM aktive_brukere ab
        LEFT JOIN analytics_saved_events se ON se.visitor_id = ab.visitor_id
        GROUP BY ab.visitor_id
      )
      SELECT
        COUNT(*) FILTER (WHERE antall = 0) AS null_lagret,
        COUNT(*) FILTER (WHERE antall = 1) AS en_lagret,
        COUNT(*) FILTER (WHERE antall = 2) AS to_lagret,
        COUNT(*) FILTER (WHERE antall >= 3) AS tre_pluss_lagret
      FROM antall_lagret
    `,
    [periodeStart, periodeSlutt],
  );

  const r = rows[0];
  return {
    '0': Number(r.null_lagret),
    '1': Number(r.en_lagret),
    '2': Number(r.to_lagret),
    '3+': Number(r.tre_pluss_lagret),
  };
}


// ─── H. Trafikkilder ────────────────────────────────────────────────────────

async function hentSources(periodeStart, periodeSlutt) {
  const { rows } = await pool.query(
    `
      WITH sesjoner_periode AS (
        SELECT
          session_id,
          visitor_id,
          COALESCE(utm_source, referrer_host, 'Direkte / ukjent') AS kilde
        FROM analytics_sessions
        WHERE started_at BETWEEN $1 AND $2
      )
      SELECT
        sp.kilde,
        COUNT(DISTINCT sp.visitor_id) AS brukere,
        COUNT(DISTINCT ae.visitor_id) FILTER (WHERE ae.event_name = 'kort_åpnet') AS aapnere,
        COUNT(DISTINCT ae.visitor_id) FILTER (WHERE ae.event_name = 'event_lagret') AS lagrere,
        COUNT(DISTINCT ae.visitor_id) FILTER (WHERE ae.event_name = 'mer_info_klikket') AS videreklikk
      FROM sesjoner_periode sp
      LEFT JOIN analytics_events ae ON ae.session_id = sp.session_id
      GROUP BY sp.kilde
      ORDER BY brukere DESC
    `,
    [periodeStart, periodeSlutt],
  );

  return rows.map((r) => ({
    kilde: r.kilde,
    brukere: Number(r.brukere),
    eventaapnere: Number(r.aapnere),
    lagrere: Number(r.lagrere),
    videreklikk: Number(r.videreklikk),
    aapnerRatePct: rate(Number(r.aapnere), Number(r.brukere)),
    lagreRatePct: rate(Number(r.lagrere), Number(r.brukere)),
  }));
}


// ─── I. Retention (7 dager) ─────────────────────────────────────────────────
//
// Blant brukere som ble FØRST SETT minst 7 dager siden: hvor mange startet
// minst én ny session STRENGT ETTER førstebesøket, innen de neste 7 dagene?
// Uavhengig av valgt periode i dashboardet (fast, global kohort-regel) —
// se oppgavens DEL 1I.

async function hentRetention() {
  const { rows } = await pool.query(
    `
      WITH kvalifiserte AS (
        SELECT visitor_id, first_seen
        FROM analytics_visitors
        WHERE first_seen <= NOW() - interval '7 days'
      ),
      tilbake AS (
        SELECT k.visitor_id
        FROM kvalifiserte k
        WHERE EXISTS (
          SELECT 1 FROM analytics_sessions s
          WHERE s.visitor_id = k.visitor_id
            AND s.started_at > k.first_seen
            AND s.started_at <= k.first_seen + interval '7 days'
        )
      )
      SELECT
        (SELECT COUNT(*) FROM kvalifiserte) AS nevner,
        (SELECT COUNT(*) FROM tilbake) AS teller
    `,
  );

  const nevner = Number(rows[0].nevner);
  const teller = Number(rows[0].teller);

  return {
    teller,
    nevner,
    prosent: rate(teller, nevner),
    forLiteData: nevner < MIN_UTVALG_FOR_RATE,
  };
}


// ─── Metadata ───────────────────────────────────────────────────────────────

async function hentMetadata() {
  const { rows } = await pool.query(`SELECT MIN(created_at) AS forste FROM analytics_events`);
  return { firstAnalyticsEventAt: rows[0].forste ? rows[0].forste.toISOString() : null };
}


// ─── Samlet ─────────────────────────────────────────────────────────────────

export async function hentInnsikt(periodeRaw) {
  const periode = tolkPeriode(periodeRaw);
  const perioder = await beregnPerioder(periode);
  const { periodeStart, periodeSlutt } = perioder;

  const [summary, timeseries, topEvents, categories, tags, saveDistribution, sources, retention, metadata] =
    await Promise.all([
      hentSummary(perioder),
      hentTimeseries(periodeStart, periodeSlutt),
      hentTopEvents(periodeStart, periodeSlutt),
      hentCategories(periodeStart, periodeSlutt),
      hentTags(periodeStart, periodeSlutt),
      hentSaveDistribution(periodeStart, periodeSlutt),
      hentSources(periodeStart, periodeSlutt),
      hentRetention(),
      hentMetadata(),
    ]);

  const { _naTall, ...summaryUtad } = summary;
  const funnel = byggFunnel(_naTall);

  return {
    periode: {
      valgt: periode,
      start: periodeStart.toISOString(),
      slutt: periodeSlutt.toISOString(),
    },
    summary: summaryUtad,
    funnel,
    timeseries,
    topEvents,
    categories,
    tags,
    saveDistribution,
    sources,
    retention,
    metadata: {
      ...metadata,
      lavDatagrunnlag: _naTall.unikeBrukere < MIN_UTVALG_FOR_RATE,
    },
  };
}
