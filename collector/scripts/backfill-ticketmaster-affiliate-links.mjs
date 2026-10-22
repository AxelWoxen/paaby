// backfill-ticketmaster-affiliate-links.mjs — engangs-backfill av affiliate-
// wrappede Ticketmaster-lenker på ALLEREDE innhentede events.
//
// BAKGRUNN: Discovery API returnerer nå affiliate-wrappede URL-er
// (https://ticketmaster.evyy.net/c/...&utm_medium=affiliate) i stedet for
// rene ticketmaster.no-lenker. Events hentet FØR affiliate-oppsettet ble
// aktivt har derfor en gammel, ren URL lagret — både i event_sources
// (source_url), i candidate-payloadet (lenke) og i publiserte events
// (event_url). En vanlig collector-kjøring vil se disse som CHANGED (siden
// content_hash inkluderer sourceUrl, se core/hash.js), men CHANGED-policyen
// overskriver med vilje ALDRI candidate/event-data automatisk (se run.js) —
// så lenkene ville aldri blitt oppdatert av seg selv, og ville fortsatt
// logges som CHANGED for alltid (content_hash på selve CHANGED-raden
// oppdateres heller aldri). Dette scriptet er den eksplisitte, trygge
// engangsoperasjonen som bryter den låsen — KUN for URL-feltet.
//
// SIKKERHET:
//  - Matcher UTELUKKENDE på provider='ticketmaster' + external_id (ingen
//    fuzzy tittel/dato/sted-matching).
//  - Skriver ALDRI med mindre den nye URL-en fra API-et er en gyldig,
//    forventet Ticketmaster-affiliate-URL (host ticketmaster.evyy.net +
//    utm_medium=affiliate).
//  - Skriver ALDRI med mindre contentHash({...freskEvent, sourceUrl: gammelUrl})
//    er IDENTISK med den lagrede content_hash-en — dvs. et matematisk bevis
//    på at INGENTING annet enn URL-en har endret seg hos kilden siden sist.
//    Er noe annet felt også endret, hopper scriptet over raden og rører den
//    ikke (samme "logg, ikke overskriv"-prinsipp som vanlig CHANGED-policy).
//  - Oppdaterer KUN lenke/source_url/content_hash — aldri tittel,
//    beskrivelse, bilde, kategori, tidspunkt, venue, pris, tags,
//    kuratortekst, featured, status eller gjentas.
//  - Idempotent: en rad der lagret URL allerede er den nye affiliate-URL-en
//    telles som "allerede oppdatert" og skrives ikke på nytt.
//
// Bruk (dry-run som standard — ingenting skrives):
//   node collector/scripts/backfill-ticketmaster-affiliate-links.mjs
//
// Faktisk skriving:
//   node collector/scripts/backfill-ticketmaster-affiliate-links.mjs --apply
//
// Mot produksjon (KUN etter at dette er testet grundig lokalt):
//   DATABASE_URL="$(heroku config:get DATABASE_URL -a paaby-api)" NODE_ENV=production \
//     node collector/scripts/backfill-ticketmaster-affiliate-links.mjs --apply

import { fileURLToPath } from 'url';

import { hentTicketmasterEvents } from '../adapters/ticketmaster.js';
import { SOURCES } from '../config/sources.js';
import { contentHash } from '../core/hash.js';
import { normaliser } from '../normalize.js';
import pool from '../../backend/db/pool.mjs';

// Felt som faktisk inngår i content_hash (se core/hash.js), i påby-skjemaet
// (samme navn som normalize.js sin normaliser() produserer) — brukt KUN til
// diagnostikk når en rad hoppes over pga. HOPP_GRUNN.ANDRE_FELT_ENDRET, for
// å vise mennesket hvilke(t) felt som trolig har endret seg hos kilden.
// Endrer ALDRI hvilken rad som skrives — ren rapportering.
const SAMMENLIGNBARE_FELTER = [
  'tittel', 'beskrivelse', 'start', 'slutt', 'sted', 'adresse', 'lat', 'lng', 'pris', 'prisTekst', 'bilde',
];

function trunker(verdi, maks = 70) {
  const tekst = String(verdi ?? '(tom)');
  return tekst.length > maks ? `${tekst.slice(0, maks)}…` : tekst;
}

/**
 * Ren funksjon — sammenligner to allerede-normaliserte påby-eventobjekter
 * på de feltene som inngår i content_hash, og returnerer hvilke som avviker.
 * Rent diagnostisk (se hentLagretFelterForSammenligning for I/O-delen).
 */
export function diffFelter(lagret, nytt) {
  if (!lagret) return [];
  const avvik = [];
  for (const felt of SAMMENLIGNBARE_FELTER) {
    const gammelVerdi = lagret[felt] ?? null;
    const nyVerdi = nytt[felt] ?? null;
    if (String(gammelVerdi ?? '') !== String(nyVerdi ?? '')) {
      avvik.push({ felt, gammel: gammelVerdi, ny: nyVerdi });
    }
  }
  return avvik;
}

export const HOPP_GRUNN = {
  IKKE_FUNNET_I_API: 'ikke-funnet-i-api',
  IKKE_AFFILIATE: 'ikke-affiliate-url',
  ALLEREDE_OPPDATERT: 'allerede-oppdatert',
  ANDRE_FELT_ENDRET: 'andre-felt-endret-ikke-trygt',
};

/**
 * Er dette nøyaktig en Ticketmaster affiliate-wrappet URL
 * (https://ticketmaster.evyy.net/c/...?...utm_medium=affiliate...)?
 * Streng med vilje — alt annet (manglende, ugyldig, fortsatt ren
 * ticketmaster.no, et annet domene som universe.com) gir false.
 */
export function erAffiliateUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return false;

  let parsed;
  try {
    parsed = new URL(url.trim());
  } catch {
    return false;
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
  if (parsed.hostname !== 'ticketmaster.evyy.net') return false;
  if (parsed.searchParams.get('utm_medium') !== 'affiliate') return false;

  return true;
}

/**
 * Ren beslutningsfunksjon — ingen DB, ingen fetch. Gitt én event_sources-rad
 * (ref) og det ferske external-eventet for samme external_id (eller null
 * hvis API-et ikke lenger returnerer det), avgjør om/hvordan raden skal
 * backfilles.
 *
 * @param {{ external_id: string, source_url: string|null, content_hash: string|null,
 *           candidate_id: string|null, event_id: string|null }} ref
 * @param {Object|null} freskEvent  external-event-form fra adapteren, eller null
 */
export function vurderRef(ref, freskEvent) {
  if (!freskEvent) {
    return { handling: 'hopp', grunn: HOPP_GRUNN.IKKE_FUNNET_I_API };
  }

  const nyUrl = freskEvent.sourceUrl;
  if (!erAffiliateUrl(nyUrl)) {
    return { handling: 'hopp', grunn: HOPP_GRUNN.IKKE_AFFILIATE };
  }

  if (ref.source_url === nyUrl) {
    return { handling: 'hopp', grunn: HOPP_GRUNN.ALLEREDE_OPPDATERT };
  }

  // Matematisk bevis på at KUN URL-en er endret: hvis vi bytter inn den
  // GAMLE URL-en i det FRISKE eventet og hashen fortsatt matcher den lagrede
  // hashen, kan ingen av de andre hash-feltene (tittel/beskrivelse/tid/
  // venue/pris/bilde/status) ha endret seg hos kilden siden sist.
  const hashMedGammelUrl = contentHash({ ...freskEvent, sourceUrl: ref.source_url });
  if (hashMedGammelUrl !== ref.content_hash) {
    return { handling: 'hopp', grunn: HOPP_GRUNN.ANDRE_FELT_ENDRET };
  }

  return {
    handling: 'oppdater',
    nyUrl,
    nyContentHash: contentHash(freskEvent),
    oppdaterCandidate: ref.candidate_id != null,
    oppdaterEvent: ref.event_id != null,
  };
}

// Henter dagens lagrede påby-felter for raden en ref peker til (candidate
// har forrang, matcher samme "candidate_id finnes → det er den aktuelle
// redigerbare raden"-logikk som resten av scriptet) — KUN for diagnostikk-
// visning ved ANDRE_FELT_ENDRET, aldri brukt til å avgjøre skriving.
async function hentLagretFelterForSammenligning(ref) {
  if (ref.candidate_id) {
    const r = await pool.query(`SELECT payload FROM event_candidates WHERE id = $1`, [ref.candidate_id]);
    const p = r.rows[0]?.payload ?? null;
    if (!p) return null;
    return Object.fromEntries(SAMMENLIGNBARE_FELTER.map((felt) => [felt, p[felt] ?? null]));
  }

  if (ref.event_id) {
    const r = await pool.query(
      `
        SELECT
          e.title AS tittel, e.description AS beskrivelse,
          o.starts_at AS start, o.ends_at AS slutt,
          v.name AS sted, v.address AS adresse, v.latitude AS lat, v.longitude AS lng,
          e.price_nok AS pris, e.price_text AS "prisTekst", e.image_url AS bilde
        FROM events e
        LEFT JOIN venues v ON v.id = e.venue_id
        LEFT JOIN event_occurrences o ON o.event_id = e.id
        WHERE e.id = $1
        ORDER BY o.starts_at ASC
        LIMIT 1
      `,
      [ref.event_id],
    );
    const row = r.rows[0];
    if (!row) return null;
    return {
      ...row,
      start: row.start instanceof Date ? row.start.toISOString() : row.start ?? null,
      slutt: row.slutt instanceof Date ? row.slutt.toISOString() : row.slutt ?? null,
    };
  }

  return null;
}

async function hentAlleTicketmasterRefs() {
  const result = await pool.query(`
    SELECT id, external_id, source_url, content_hash, candidate_id, event_id
    FROM event_sources
    WHERE provider = 'ticketmaster'
    ORDER BY external_id ASC
  `);
  return result.rows;
}

// KUN lenke-feltet i candidate-payloadet (jsonb_set på én nøkkel) — ingen
// re-serialisering av resten av payloadet, ingen tag-omregning, ingen
// risiko for å røre andre felt.
async function oppdaterRef(ref, plan) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (plan.oppdaterCandidate) {
      await client.query(
        `
          UPDATE event_candidates
          SET payload = jsonb_set(payload, '{lenke}', to_jsonb($2::text))
          WHERE id = $1
        `,
        [ref.candidate_id, plan.nyUrl],
      );
    }

    if (plan.oppdaterEvent) {
      await client.query(
        `UPDATE events SET event_url = $2 WHERE id = $1`,
        [ref.event_id, plan.nyUrl],
      );
    }

    await client.query(
      `UPDATE event_sources SET source_url = $2, content_hash = $3 WHERE id = $1`,
      [ref.id, plan.nyUrl, plan.nyContentHash],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function main() {
  const apply = process.argv.includes('--apply');

  console.log('─'.repeat(60));
  console.log('backfill-ticketmaster-affiliate-links');
  console.log('─'.repeat(60));
  console.log(`Modus: ${apply ? 'APPLY — skriver til databasen' : 'DRY-RUN — kun rapport, ingenting skrives'}`);

  try {
    const { hostname, pathname } = new URL(process.env.DATABASE_URL ?? '');
    console.log(`Database: ${hostname}${pathname}`);
  } catch {
    // DATABASE_URL mangler/ugyldig — pool.mjs kaster uansett under import, ikke duplisert feilhåndtering her.
  }

  const source = SOURCES.find((s) => s.adapter === 'ticketmaster');
  if (!source) {
    console.error('Fant ingen ticketmaster-kilde i config/sources.js');
    process.exitCode = 1;
    return;
  }

  console.log('\nHenter friske Ticketmaster-events fra Discovery API ...');
  const freskeEventer = await hentTicketmasterEvents(source);
  const freskByExternalId = new Map(freskeEventer.map((e) => [e.externalId, e]));
  console.log(`Hentet ${freskeEventer.length} events fra API.\n`);

  const refs = await hentAlleTicketmasterRefs();

  const tellere = {
    refsTotalt: refs.length,
    candidatesVurdert: 0,
    publishedVurdert: 0,
    gamleUrlerFunnet: 0,
    affiliateUrlerFraApi: 0,
    candidatesOppdatert: 0,
    publishedOppdatert: 0,
    skippetIkkeFunnet: 0,
    skippetIkkeAffiliate: 0,
    skippetAlleredeOppdatert: 0,
    skippetAndreFeltEndret: 0,
    feil: 0,
  };

  const andreFeltEndretDetaljer = [];

  for (const ref of refs) {
    if (ref.candidate_id != null) tellere.candidatesVurdert++;
    if (ref.event_id != null) tellere.publishedVurdert++;
    if (typeof ref.source_url === 'string' && ref.source_url.includes('ticketmaster.no')) {
      tellere.gamleUrlerFunnet++;
    }

    const fresk = freskByExternalId.get(ref.external_id);
    if (fresk && erAffiliateUrl(fresk.sourceUrl)) tellere.affiliateUrlerFraApi++;

    const plan = vurderRef(ref, fresk);

    if (plan.handling === 'hopp') {
      if (plan.grunn === HOPP_GRUNN.IKKE_FUNNET_I_API) tellere.skippetIkkeFunnet++;
      else if (plan.grunn === HOPP_GRUNN.IKKE_AFFILIATE) tellere.skippetIkkeAffiliate++;
      else if (plan.grunn === HOPP_GRUNN.ALLEREDE_OPPDATERT) tellere.skippetAlleredeOppdatert++;
      else if (plan.grunn === HOPP_GRUNN.ANDRE_FELT_ENDRET) {
        tellere.skippetAndreFeltEndret++;

        const lagret = await hentLagretFelterForSammenligning(ref);
        const nyttPåbyForm = normaliser(fresk);
        const avvik = diffFelter(lagret, nyttPåbyForm);
        const tittel = lagret?.tittel ?? nyttPåbyForm.tittel ?? '(ukjent tittel)';

        andreFeltEndretDetaljer.push({ tittel, externalId: ref.external_id, avvik });

        console.log(`  [HOPPER OVER] «${tittel}» (${ref.external_id}) — andre felt enn URL har endret seg hos kilden, ikke trygt å auto-backfille`);
        if (avvik.length === 0) {
          console.log('      (klarte ikke isolere hvilket felt — se content_hash/rad manuelt)');
        }
        for (const a of avvik) {
          console.log(`      ${a.felt}: "${trunker(a.gammel)}" → "${trunker(a.ny)}"`);
        }
      }
      continue;
    }

    if (plan.oppdaterCandidate) tellere.candidatesOppdatert++;
    if (plan.oppdaterEvent) tellere.publishedOppdatert++;

    console.log(`  [${apply ? 'OPPDATERER' : 'VILLE OPPDATERT'}] ${ref.external_id} → ${plan.nyUrl}`);

    if (apply) {
      try {
        await oppdaterRef(ref, plan);
      } catch (err) {
        console.error(`  [FEIL VED SKRIVING] ${ref.external_id}: ${err.message}`);
        tellere.feil++;
      }
    }
  }

  console.log('\n' + '─'.repeat(60));
  console.log('RAPPORT');
  console.log('─'.repeat(60));
  const candidatesLabel = apply ? 'Candidates oppdatert' : 'Candidates som ville blitt oppdatert';
  const publishedLabel = apply ? 'Published events oppdatert' : 'Published events som ville blitt oppdatert';

  console.log(`Ticketmaster refs totalt: ${tellere.refsTotalt}`);
  console.log(`Candidates vurdert: ${tellere.candidatesVurdert}`);
  console.log(`Published events vurdert: ${tellere.publishedVurdert}`);
  console.log(`Gamle rene ticketmaster.no-URL-er (lagret): ${tellere.gamleUrlerFunnet}`);
  console.log(`Affiliate-URL-er funnet fra API: ${tellere.affiliateUrlerFraApi}`);
  console.log(`${candidatesLabel}: ${tellere.candidatesOppdatert}`);
  console.log(`${publishedLabel}: ${tellere.publishedOppdatert}`);
  console.log(`Skippet – ikke i API-respons: ${tellere.skippetIkkeFunnet}`);
  console.log(`Skippet – ikke affiliate-URL: ${tellere.skippetIkkeAffiliate}`);
  console.log(`Skippet – allerede oppdatert: ${tellere.skippetAlleredeOppdatert}`);
  console.log(`Skippet – andre felt endret (ikke trygt): ${tellere.skippetAndreFeltEndret}`);
  console.log(`Feil: ${tellere.feil}`);
  console.log('─'.repeat(60));

  if (andreFeltEndretDetaljer.length > 0) {
    console.log('\nDETALJER — andre source-felt endret (ikke auto-backfillet):');
    for (const d of andreFeltEndretDetaljer) {
      console.log(`  «${d.tittel}» (${d.externalId})`);
      if (d.avvik.length === 0) {
        console.log('      (klarte ikke isolere hvilket felt)');
      }
      for (const a of d.avvik) {
        console.log(`      ${a.felt}: "${trunker(a.gammel)}" → "${trunker(a.ny)}"`);
      }
    }
  }

  if (!apply) {
    console.log('\nDette var en DRY-RUN — ingenting ble skrevet til databasen.');
    console.log('Kjør med --apply for å faktisk oppdatere.');
  }

  return { tellere, andreFeltEndretDetaljer };
}

const kjøresDirekte = process.argv[1] === fileURLToPath(import.meta.url);
if (kjøresDirekte) {
  main()
    .catch((err) => {
      console.error('\nUventet feil:', err.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
