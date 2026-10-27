// Inngangspunkt for kollektoren.
// Kjør: node run.js  (eller: npm run collect fra collector/-mappen)
//
// Hva som skjer steg for steg, per kilde i config/sources.js:
//  1. Hent external-events med riktig adapter (adapters/index.js)
//  2. Normaliser hvert external-event til påby-eventformen (normalize.js)
//  3. Filtrer bort det som er utenfor 30-dagers horisont eller avslått før
//  4. Avgjør NEW / UNCHANGED / CHANGED via kilde-identitet (provider +
//     externalId, se event_sources/core/sync.js) der kilden oppgir det —
//     ellers dagens rene tittel+dato+sted-dedupe (dedupe.js) som fallback
//  5. Lagre nye candidates (+ kobling til kilden) i databasen
//  6. Skriv ut en lesbar oppsummering per kilde
import { fileURLToPath } from 'url';
import { SOURCES }       from './config/sources.js';
import { hentFraKilde }  from './adapters/index.js';
import { normaliser }    from './normalize.js';
import { dedupliser }    from './dedupe.js';
import { contentHash, snapshotFelter } from './core/hash.js';
import { avgjorHandling, finnEksisterendeMatch, diffSnapshots } from './core/sync.js';
import {
  lesCandidates,
  leggTilCandidates,
  lesRejected,
} from './store/candidates-db.js';
import { lesPubliserte } from './store/published.js';
import {
  finnRef,
  oppdaterSett,
  oppdaterEndretObservasjon,
  finnSisteLoggetHash,
  loggKildeEndring,
  opprettRefTilEksisterende,
  opprettCandidateOgRef,
} from './store/external-event-refs.js';

export const MAX_DAGER_FREM = 30;

export function innenforHorisont(paabyEvent, nå = new Date()) {
  if (!paabyEvent.start) return false;
  const start = new Date(paabyEvent.start);
  if (Number.isNaN(start.getTime())) return false;
  const maksDato = new Date(nå.getTime() + MAX_DAGER_FREM * 24 * 60 * 60 * 1000);
  return start >= nå && start <= maksDato;
}

export function byggDuplikatHint(match) {
  return `Ligner: «${match.tittel}»${match.sted ? ` hos ${match.sted}` : ''} samme dag`;
}

// Generisk regel for alle kilder: hvis en kilde oppgir tokenEnv (navnet på
// en nødvendig env-variabel) og den variabelen ikke er satt, hopper vi over
// kilden i stedet for å krasje hele kjøringen. run.js trenger ikke vite
// NOE om hva variabelen faktisk brukes til.
export function skalHoppeOverKilde(source, env = process.env) {
  return Boolean(source.tokenEnv) && !env[source.tokenEnv];
}

// Behandler ÉTT normalisert event mot databasen. All faktisk skriving skjer
// her — resten av filen er henting/filtrering/logging. Eksportert for
// testing (kjører mot lokal paaby_dev, se collector/tests/).
export async function behandleEvent(external, paaby, { avslåtteIder, eksisterende, opprettetIDenneKjøringen, tellere }) {
  if (avslåtteIder.has(paaby.id)) {
    tellere.avslått++;
    return;
  }

  // Ingen kildeidentitet oppgitt (adapteren satte ikke provider/externalId)
  // — fall tilbake til ren tittel+dato+sted-dedupe, akkurat som før denne
  // refaktoreringen. Ingen kobling å lære noe sted.
  if (!external.provider || !external.externalId) {
    const [erNytt] = dedupliser([paaby], eksisterende);
    if (erNytt) {
      tellere.nye += await leggTilCandidates([paaby]);
    } else {
      tellere.uendret++;
    }
    return;
  }

  const hash = contentHash(external);
  const ref  = await finnRef(external.provider, external.externalId);
  const handling = avgjorHandling(hash, ref);

  if (handling === 'UNCHANGED') {
    await oppdaterSett(ref.id, {
      sourceStatus: external.sourceStatus,
      sourceUpdatedAt: external.sourceUpdatedAt,
    });
    tellere.uendret++;
    return;
  }

  if (handling === 'CHANGED') {
    // Bevisst: content_hash på selve ref-raden oppdateres IKKE her — kun
    // last_seen_at/source_status/source_updated_at/content_snapshot. Hvis vi
    // flyttet den lagrede hashen hit, ville neste kjøring tro eventet var
    // UNCHANGED, og vi ville mistet kunnskapen om at kilde-data og
    // Påby-data er ulike. Candidate/publisert event røres IKKE automatisk —
    // kun logget, til vi ev. bygger en egen review-flyt for source-endringer.
    const nySnapshot = snapshotFelter(external);

    // Dedupe mot SIST LOGGEDE hash (ikke mot den opprinnelig frosne
    // content_hash) — en uløst CHANGED skal kun logges ÉN gang, ikke på
    // nytt hver kjøring så lenge ingen har håndtert den (se
    // external-event-refs.js:finnSisteLoggetHash).
    const sisteLoggetHash = await finnSisteLoggetHash(ref.id);
    if (sisteLoggetHash !== hash) {
      const { changedFields, diff } = diffSnapshots(ref.content_snapshot, nySnapshot);
      await loggKildeEndring({
        eventSourceId: ref.id,
        previousContentHash: sisteLoggetHash ?? ref.content_hash,
        observedContentHash: hash,
        changedFields,
        diff,
      });
    }

    await oppdaterEndretObservasjon(ref.id, {
      sourceStatus: external.sourceStatus,
      sourceUpdatedAt: external.sourceUpdatedAt,
      contentSnapshot: nySnapshot,
    });
    console.log(`  [ENDRET] ${external.provider}:${external.externalId} — «${paaby.tittel}» har endret seg hos kilden`);
    tellere.endret++;
    return;
  }

  // handling === 'NEW' — ingen ref fantes fra før.
  //
  // finnEksisterendeMatch() ser kun på den FORHÅNDSLASTEDE eksisterende-lista
  // (candidates+publiserte fra FØR denne kjøringen startet) — den ser ikke
  // candidates som akkurat ble opprettet av et TIDLIGERE event i SAMME
  // kjøring. Det skjer i praksis: samme produksjon med flere visninger
  // samme dag (ulikt klokkeslett) gir samme legacy_id, siden den kun er
  // dato-granulær. Uten denne sjekken ville visning nr. 2 forsvinne sporløst
  // (ON CONFLICT DO NOTHING på legacy_id, aldri flagget, aldri egen rad) —
  // oppdaget med ekte Ticketmaster-data (to visninger av "Oliver Twist").
  const match = finnEksisterendeMatch(paaby, eksisterende)
    ?? (opprettetIDenneKjøringen?.has(paaby.id)
          ? { type: 'fuzzy', match: opprettetIDenneKjøringen.get(paaby.id) }
          : null);

  if (match?.type === 'url') {
    // Sterkt signal (samme lenke) — lær koblingen, opprett IKKE en ny
    // candidate for noe vi allerede har.
    await opprettRefTilEksisterende({
      provider: external.provider,
      externalId: external.externalId,
      sourceUrl: external.sourceUrl,
      sourceStatus: external.sourceStatus,
      sourceUpdatedAt: external.sourceUpdatedAt,
      contentHash: hash,
      contentSnapshot: snapshotFelter(external),
      candidateId: match.match._erCandidate ? match.match._dbId : null,
      publishedEventId: match.match._erCandidate ? null : match.match._dbId,
    });
    console.log(`  [KOBLET] ${external.provider}:${external.externalId} → eksisterende «${paaby.tittel}» (samme lenke)`);
    tellere.koblet++;
    return;
  }

  // Ingen match, eller kun et usikkert (fuzzy) treff — opprett ny candidate.
  // Usikre treff auto-merges ALDRI: de får bare possible_duplicate-flagget,
  // akkurat som innsendinger allerede gjør.
  //
  // Et fuzzy-treff betyr per definisjon at legacy_id (sted-tittel-dato) er
  // identisk med raden vi fant — samme felt som dedupe.js sin hash. Uten å
  // gjøre noe med det ville INSERT-en under truffet nøyaktig den samme
  // UNIQUE-constrainten og stille koblet seg til DEN GAMLE raden i stedet
  // for å opprette en egen, flagget candidate. Gjør derfor id-en unik for
  // nettopp dette source-eventet (stabilt — samme kilde-id gir samme
  // disambiguerte legacy_id neste kjøring også).
  const eventÅLagre = match?.type === 'fuzzy'
    ? { ...paaby, id: `${paaby.id}__${external.provider}-${external.externalId}` }
    : paaby;

  const { candidateId, lagtTil } = await opprettCandidateOgRef({
    event: eventÅLagre,
    source: 'collector',
    muligDuplikat: match?.type === 'fuzzy',
    duplikatHint: match ? byggDuplikatHint(match.match) : null,
    provider: external.provider,
    externalId: external.externalId,
    sourceUrl: external.sourceUrl,
    sourceStatus: external.sourceStatus,
    sourceUpdatedAt: external.sourceUpdatedAt,
    contentHash: hash,
    contentSnapshot: snapshotFelter(external),
  });

  if (lagtTil) {
    tellere.nye++;
    if (match?.type === 'fuzzy') {
      tellere.muligDuplikat++;
    } else {
      // Den FØRSTE candidaten for denne legacy_id-en i denne kjøringen —
      // husk den slik at et senere event-i-samme-kjøring med samme
      // tittel+dato+sted blir fanget opp av sjekken over, i stedet for å
      // kollidere stille mot UNIQUE-constrainten.
      opprettetIDenneKjøringen?.set(paaby.id, {
        tittel: paaby.tittel, sted: paaby.sted, lenke: paaby.lenke,
        _erCandidate: true, _dbId: candidateId,
      });
    }
  }
}

export async function behandleKilde(source, context) {
  const tellere = { nye: 0, uendret: 0, endret: 0, koblet: 0, avslått: 0, muligDuplikat: 0 };
  let feil = 0;
  let innenforHorisontAntall = 0;

  let eksternEventer;
  try {
    eksternEventer = await hentFraKilde(source);
  } catch (err) {
    console.error(`  FEIL ved henting: ${err.message}`);
    return { feil: 1 };
  }

  for (const external of eksternEventer) {
    const paaby = normaliser(external);
    if (!paaby.tittel || !paaby.start) continue;
    if (!innenforHorisont(paaby)) continue;
    innenforHorisontAntall++;

    try {
      await behandleEvent(external, paaby, { ...context, tellere });
    } catch (err) {
      console.error(`  FEIL ved behandling av «${paaby.tittel}»: ${err.message}`);
      feil++;
    }
  }

  console.log(`  Hentet: ${eksternEventer.length}`);
  console.log(`  Innenfor ${MAX_DAGER_FREM}-dagers horisont: ${innenforHorisontAntall}`);
  console.log(`  Nye: ${tellere.nye}`);
  console.log(`  Endret: ${tellere.endret}`);
  console.log(`  Uendret: ${tellere.uendret}`);
  console.log(`  Koblet til eksisterende: ${tellere.koblet}`);
  console.log(`  Mulige duplikater (ny candidate, flagget): ${tellere.muligDuplikat}`);
  console.log(`  Droppet (avslått tidligere): ${tellere.avslått}`);
  console.log(`  Feil: ${feil}`);

  return { ...tellere, feil };
}

export async function main() {
  console.log('─'.repeat(50));
  console.log('paaby-collector');
  console.log('─'.repeat(50));

  const [candidatesRaw, rejected, publiserteRaw] = await Promise.all([
    lesCandidates(),
    lesRejected(),
    lesPubliserte(),
  ]);

  // Slått sammen til én liste for fallback-dedupe/match — merket med
  // _erCandidate slik at en treff vet om den skal koble candidate_id eller
  // published_event_id på en event_sources-rad.
  const eksisterende = [
    ...candidatesRaw.map((e) => ({ ...e, _erCandidate: true })),
    ...publiserteRaw.map((e) => ({ ...e, _erCandidate: false })),
  ];
  const avslåtteIder = new Set(rejected);

  // Deles mellom ALLE kilder i denne kjøringen — fanger opp kollisjoner
  // mellom to events fra (samme eller ulike) kilder i samme run, se
  // kommentar i behandleEvent().
  const opprettetIDenneKjøringen = new Map();

  console.log(`Eksisterende: ${publiserteRaw.length} publisert, ${candidatesRaw.length} i kø, ${rejected.length} avslått\n`);

  let totaltNye = 0;

  for (const source of SOURCES) {
    console.log('─'.repeat(50));
    console.log(`${source.id} (adapter=${source.adapter})`);
    console.log('─'.repeat(50));

    if (skalHoppeOverKilde(source)) {
      console.log(`[hopper over] ${source.id} – mangler ${source.tokenEnv}\n`);
      continue;
    }

    const resultat = await behandleKilde(source, { avslåtteIder, eksisterende, opprettetIDenneKjøringen });
    totaltNye += resultat.nye ?? 0;
    console.log('');

    // God skikk: liten pause mellom kilder slik at vi ikke hamrer servere
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log('─'.repeat(50));
  console.log(`Ferdig. ${totaltNye} nye candidates lagret i databasen.`);
  if (totaltNye > 0) {
    console.log('Neste steg: cd collector && npm run review');
    console.log('            åpne http://localhost:3001');
  } else {
    console.log('Ingenting nytt å reviewe.');
  }
  console.log('─'.repeat(50));
}

// Kjør kun når filen faktisk startes direkte (node run.js) — ikke når den
// importeres av tester (collector/tests/*.test.mjs importerer bl.a.
// behandleEvent/behandleKilde/skalHoppeOverKilde fra denne filen).
const kjøresDirekte = process.argv[1] === fileURLToPath(import.meta.url);
if (kjøresDirekte) {
  main().catch((err) => {
    console.error('\nUventet feil:', err.message);
    process.exit(1);
  });
}
