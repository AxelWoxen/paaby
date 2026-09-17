// innsendingService.mjs — forretningslogikk for "Send inn ditt event".
//
// Prinsipp: server-siden validerer ALT på nytt (samme regler som skjemaet i
// send-inn/index.html) — klienten kan ikke stoles på. En innsending havner
// alltid som en 'pending' event_candidates-rad med source='innsending' og
// publiseres aldri automatisk.

import crypto from 'crypto';
import pool from '../db/pool.mjs';
import { osloLokalTilISO } from '../../js/application/oslo-tid.js';
import { erGyldigUrl } from '../../js/application/validering.js';

const TILLATTE_KATEGORIER = new Set(['musikk', 'klubb', 'pafunn']);
const UKEDAGER = ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag', 'søndag'];
const MAKS_BESKRIVELSE = 500;
const MAKS_KOMMENTAR   = 1000;

// ─── Hjelpere ─────────────────────────────────────────────────────────────

function tekst(verdi) {
  return typeof verdi === 'string' ? verdi.trim() : '';
}

function erTom(verdi) {
  return tekst(verdi) === '';
}

/* "HH:MM" → { time, min } eller null hvis ugyldig. */
function parseKlokkeslett(verdi) {
  const m = tekst(verdi).match(/^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/);
  if (!m) return null;
  return { time: Number(m[1]), min: Number(m[2]) };
}

/* "YYYY-MM-DD" → { år, maned, dag } eller null hvis ugyldig (inkl. kalenderdato). */
function parseDato(verdi) {
  const m = tekst(verdi).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const år = Number(m[1]), maned = Number(m[2]), dag = Number(m[3]);
  // Rundtur via Date.UTC for å avvise umulige datoer (f.eks. 2026-02-30).
  const d = new Date(Date.UTC(år, maned - 1, dag));
  if (d.getUTCFullYear() !== år || d.getUTCMonth() !== maned - 1 || d.getUTCDate() !== dag) return null;
  return { år, maned, dag };
}

/* Neste kalenderdag — kalendermatte via Date.UTC, håndterer måneds-/årsskifte
   automatisk (f.eks. 31. januar → 1. februar) uten DST-komplikasjoner siden
   vi kun regner med kalenderfelt, aldri instanser. */
function nesteDag({ år, maned, dag }) {
  const d = new Date(Date.UTC(år, maned - 1, dag + 1));
  return { år: d.getUTCFullYear(), maned: d.getUTCMonth() + 1, dag: d.getUTCDate() };
}

function byggGjentasStreng(type, dag) {
  if (!type) return null;
  if (!UKEDAGER.includes(dag)) return null;
  if (type === 'ukentlig')        return `ukentlig:${dag}`;
  if (type === 'månedlig-første') return `månedlig:første-${dag}`;
  if (type === 'månedlig-siste')  return `månedlig:siste-${dag}`;
  return null;
}

// ─── Validering ─────────────────────────────────────────────────────────────

/**
 * Validerer alle tekstfeltene i en innsending.
 * @returns {{ feil: Object }|{ verdier: Object }}
 */
export function validerInnsending(body) {
  const feil = {};

  const kategori = tekst(body.kategori);
  if (!TILLATTE_KATEGORIER.has(kategori)) feil.kategori = 'Velg en kategori.';

  const tittel = tekst(body.tittel);
  if (!tittel) feil.tittel = 'Tittel er påkrevd.';

  const dato = parseDato(body.dato);
  if (!dato) feil.dato = 'Ugyldig dato.';

  const start = parseKlokkeslett(body.startTid);
  if (!start) feil.startTid = 'Ugyldig starttid.';

  let sluttISO = null;
  if (!erTom(body.sluttTid)) {
    const slutt = parseKlokkeslett(body.sluttTid);
    if (!slutt) {
      feil.sluttTid = 'Ugyldig sluttid.';
    } else if (start) {
      // Sluttid ≤ starttid → gjelder natten over (klubbkvelder).
      const startMinutter  = start.time * 60 + start.min;
      const sluttMinutter  = slutt.time * 60 + slutt.min;
      const sluttDagKalender = sluttMinutter <= startMinutter ? nesteDag(dato) : dato;
      sluttISO = osloLokalTilISO(
        sluttDagKalender.år, sluttDagKalender.maned, sluttDagKalender.dag,
        slutt.time, slutt.min,
      );
    }
  }

  const gjentasType = tekst(body.gjentasType);
  const gjentasDag  = tekst(body.gjentasDag);
  let gjentas = null;
  if (gjentasType) {
    gjentas = byggGjentasStreng(gjentasType, gjentasDag);
    if (!gjentas) feil.gjentasType = 'Ugyldig gjentas-valg.';
  }

  const sted = tekst(body.sted);
  if (!sted) feil.sted = 'Sted er påkrevd.';

  const adresse = tekst(body.adresse);
  if (!adresse) feil.adresse = 'Adresse er påkrevd.';

  const prisType = tekst(body.prisType);
  let pris = null;
  let prisTekst = tekst(body.prisTekst) || null;
  if (!['gratis', 'kr', 'ukjent'].includes(prisType)) {
    feil.prisType = 'Velg en pris-type.';
  } else if (prisType === 'gratis') {
    pris = 0;
    prisTekst = prisTekst ?? 'Gratis';
  } else if (prisType === 'kr') {
    const kr = Number(tekst(body.prisKr));
    if (!Number.isFinite(kr) || kr < 0) {
      feil.prisKr = 'Oppgi en gyldig pris i kroner.';
    } else {
      pris = Math.round(kr);
    }
  } /* 'ukjent' → pris forblir null */

  const beskrivelse = tekst(body.beskrivelse);
  if (!beskrivelse) feil.beskrivelse = 'Beskrivelse er påkrevd.';
  else if (beskrivelse.length > MAKS_BESKRIVELSE) feil.beskrivelse = `Maks ${MAKS_BESKRIVELSE} tegn.`;

  const lenke = tekst(body.lenke) || null;
  if (lenke && !erGyldigUrl(lenke)) feil.lenke = 'Lenken må starte med https://.';

  const bildeLenke = tekst(body.bildeLenke) || null;
  if (bildeLenke && !erGyldigUrl(bildeLenke)) feil.bildeLenke = 'Bildelenken må starte med https://.';

  const kommentar = tekst(body.kommentar) || null;
  if (kommentar && kommentar.length > MAKS_KOMMENTAR) feil.kommentar = `Maks ${MAKS_KOMMENTAR} tegn.`;

  const navn = tekst(body.navn);
  if (!navn) feil.navn = 'Navn er påkrevd.';

  const organisasjon = tekst(body.organisasjon) || null;

  const kontakt = tekst(body.kontakt);
  if (!kontakt) feil.kontakt = 'Oppgi e-post eller Instagram-brukernavn.';

  const bekreft = body.bekreft === 'true' || body.bekreft === 'on' || body.bekreft === true;
  if (!bekreft) feil.bekreft = 'Du må bekrefte at informasjonen stemmer.';

  if (Object.keys(feil).length > 0) return { feil };

  return {
    verdier: {
      kategori, tittel,
      startISO: osloLokalTilISO(dato.år, dato.maned, dato.dag, start.time, start.min),
      sluttISO,
      gjentas,
      sted, adresse,
      pris, prisTekst,
      beskrivelse, lenke, bildeLenke,
      submitter: { navn, organisasjon, kontakt, kommentar },
    },
  };
}

// ─── Bilde: magic bytes ─────────────────────────────────────────────────────

/**
 * Sjekker faktisk filtype via magic bytes (ikke mimetype fra klienten).
 * @returns {string|null}  'image/jpeg' | 'image/png' | 'image/webp' | null
 */
export function gjenkjennBildetype(buffer) {
  if (!buffer || buffer.length < 12) return null;

  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'image/jpeg';

  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47 &&
    buffer[4] === 0x0D && buffer[5] === 0x0A && buffer[6] === 0x1A && buffer[7] === 0x0A
  ) return 'image/png';

  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) return 'image/webp';

  return null;
}

// ─── Duplikat-varsel ────────────────────────────────────────────────────────

function normaliserTittel(tittel) {
  return tekst(tittel).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/**
 * Enkel "godt nok"-heuristikk: finnes det en kandidat eller et publisert
 * event samme Oslo-kalenderdag med lignende tittel eller samme sted?
 * Kun et varsel til reviewer — blokkerer aldri innsendingen.
 */
export async function finnMuligDuplikat(tittel, sted, startISO) {
  const dagNøkkel   = startISO.slice(0, 10); // "YYYY-MM-DD" — se osloDataNokkel
  const normTittel  = normaliserTittel(tittel);
  const normSted    = tekst(sted).toLowerCase();

  const [kandidater, publiserte] = await Promise.all([
    pool.query(
      `SELECT payload->>'tittel' AS tittel, payload->>'sted' AS sted
       FROM event_candidates
       WHERE payload->>'start' LIKE $1
         AND status = 'pending'`,
      [`${dagNøkkel}%`],
    ),
    pool.query(
      `SELECT e.title AS tittel, v.name AS sted
       FROM events e
       JOIN event_occurrences o ON o.event_id = e.id
       LEFT JOIN venues v ON v.id = e.venue_id
       WHERE o.starts_at::date = $1::date
         AND e.status = 'active'`,
      [dagNøkkel],
    ),
  ]);

  const kandidatTreff = [...kandidater.rows, ...publiserte.rows].find((rad) => {
    const radTittel = normaliserTittel(rad.tittel);
    const radSted   = tekst(rad.sted).toLowerCase();
    const lignendeTittel = normTittel.length > 2 && radTittel.length > 2 &&
      (radTittel.includes(normTittel) || normTittel.includes(radTittel));
    const likSted = normSted !== '' && radSted !== '' && radSted === normSted;
    return lignendeTittel || likSted;
  });

  if (!kandidatTreff) return { muligDuplikat: false, hint: null };

  return {
    muligDuplikat: true,
    hint: `Ligner: «${kandidatTreff.tittel}»${kandidatTreff.sted ? ` hos ${kandidatTreff.sted}` : ''} samme dag`,
  };
}

// ─── Lagring ────────────────────────────────────────────────────────────────

/**
 * Lagrer en validert innsending: event_candidates-rad (+ evt. candidate_images).
 * bildeUrlBygger(candidateImageId) → URL som settes som payload.bilde.
 *
 * @returns {{ id: string }}
 */
export async function lagreInnsending(verdier, bilde, bildeUrlBygger) {
  const id = `innsendt-${crypto.randomUUID()}`;

  const payload = {
    id,
    tittel:       verdier.tittel,
    kategori:     verdier.kategori,
    sted:         verdier.sted,
    adresse:      verdier.adresse,
    lat:          null,
    lng:          null,
    start:        verdier.startISO,
    slutt:        verdier.sluttISO,
    pris:         verdier.pris,
    prisTekst:    verdier.prisTekst,
    beskrivelse:  verdier.beskrivelse,
    kuratortekst: null,
    lenke:        verdier.lenke,
    bilde:        verdier.bildeLenke, // overskrives under hvis fil lastet opp
    gjentas:      verdier.gjentas,
    sistVerifisert: new Date().toISOString(),
  };

  const { muligDuplikat, hint } = await finnMuligDuplikat(
    verdier.tittel, verdier.sted, verdier.startISO,
  );

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const insertResult = await client.query(
      `
        INSERT INTO event_candidates (
          legacy_id, payload, status, source,
          submitter_name, submitter_org, submitter_contact, submitter_note,
          possible_duplicate, duplicate_hint
        )
        VALUES ($1, $2::jsonb, 'pending', 'innsending', $3, $4, $5, $6, $7, $8)
        RETURNING id
      `,
      [
        id,
        JSON.stringify(payload),
        verdier.submitter.navn,
        verdier.submitter.organisasjon,
        verdier.submitter.kontakt,
        verdier.submitter.kommentar,
        muligDuplikat,
        hint,
      ],
    );

    const candidateId = insertResult.rows[0].id;

    if (bilde) {
      const bildeResult = await client.query(
        `
          INSERT INTO candidate_images (candidate_id, mime_type, data, byte_size)
          VALUES ($1, $2, $3, $4)
          RETURNING id
        `,
        [candidateId, bilde.mimeType, bilde.buffer, bilde.buffer.length],
      );

      const bildeUrl = bildeUrlBygger(bildeResult.rows[0].id);

      await client.query(
        `UPDATE event_candidates SET payload = jsonb_set(payload, '{bilde}', $2::jsonb) WHERE id = $1`,
        [candidateId, JSON.stringify(bildeUrl)],
      );
    }

    await client.query('COMMIT');
    return { id };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
