// Inngangspunkt for kollektoren.
// Kjør: node run.js  (eller: npm run collect fra collector/-mappen)
//
// Automatisk kjøring (agenten): node run.js --dager=14 (npm run agent).
//
// Hva som skjer steg for steg, per kilde i config/sources.js:
//  1. Hent external-events med riktig adapter (adapters/index.js)
//  2. Normaliser hvert external-event til påby-eventformen (normalize.js),
//     og fyll inn adresse/koordinater fra kjente steder (core/kvalitet.js)
//  3. Filtrer bort det som er utenfor horisonten (30 dager, eller --dager)
//     eller avslått før
//  4. Avgjør NEW / UNCHANGED / CHANGED via kilde-identitet (provider +
//     externalId, se event_sources/core/sync.js) der kilden oppgir det —
//     ellers dagens rene tittel+dato+sted-dedupe (dedupe.js) som fallback
//  5. Lagre nye candidates (+ kobling til kilden) i databasen, med agentens
//     vurdering: relevans-score, manglende felt, evt. holdt ute
//     (core/interesse.js, trent på nytt fra beslutningene hver kjøring)
//  6. Skriv ut en lesbar oppsummering per kilde, scor alle ventende funn
//     på nytt, og skriv en sortert gjennomgang av Fra API
import { fileURLToPath } from 'url';
import pool            from '../backend/db/pool.mjs';
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
import { manglendeFeltnavn, berikFraKjentSted } from './core/kvalitet.js';
import {
  trekkUtEgenskaper, merkUtfall, trenModell, scorEvent, finnHoldUteGrunn, agentensValg,
} from './core/interesse.js';
import { HOLD_UTE, ALLTID_MED } from './config/kuratering.js';
import {
  startKjøring, avsluttKjøring, lesTreningsdata, lesKjenteSteder,
  lesVentendeCollectorFunn, oppdaterVurdering,
} from './store/laering.js';
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

// `node run.js --dager=14` — den automatiske kjøringen (npm run agent) ser
// bare to uker frem. Uten flagg: samme 30 dager som før.
export function lesHorisontDager(argv = process.argv) {
  const arg = argv.find((a) => a.startsWith('--dager='));
  const dager = arg ? Number(arg.slice('--dager='.length)) : MAX_DAGER_FREM;
  return Number.isInteger(dager) && dager > 0 && dager <= 90 ? dager : MAX_DAGER_FREM;
}

export function innenforHorisont(paabyEvent, nå = new Date(), dager = MAX_DAGER_FREM) {
  if (!paabyEvent.start) return false;
  const start = new Date(paabyEvent.start);
  if (Number.isNaN(start.getTime())) return false;
  const maksDato = new Date(nå.getTime() + dager * 24 * 60 * 60 * 1000);
  return start >= nå && start <= maksDato;
}

/**
 * Agentens syn på ett nytt funn: score + grunner fra modellen, hvilke felt
 * som mangler, og om det skal holdes ute av «Fra API». Uten modell (f.eks.
 * i tester) blir score null og ingenting holdes ute — kun mangler fylles.
 */
export function vurder(paaby, provider, { modell = null, regler = {}, runId = null } = {}) {
  const egenskaper = trekkUtEgenskaper(paaby, { provider });
  const { score, grunner } = scorEvent(egenskaper, modell);
  return {
    runId,
    score,
    grunner,
    mangler: manglendeFeltnavn(paaby),
    holdtUte: modell ? finnHoldUteGrunn(paaby, egenskaper, modell, regler) : null,
  };
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
export async function behandleEvent(external, paaby, {
  avslåtteIder, eksisterende, opprettetIDenneKjøringen, tellere,
  modell = null, regler = {}, runId = null, nyeFunn = null,
}) {
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
  //
  // Candidates fra TIDLIGERE kilder i samme kjøring sammenlignes også — det
  // er nettopp der samme konsert dukker opp fra Ticketmaster og deretter
  // Tickster (kryss-kilde-dedupe, se core/sync.js).
  const kandidaterForMatch = opprettetIDenneKjøringen?.size
    ? [...eksisterende, ...opprettetIDenneKjøringen.values()]
    : eksisterende;
  const match = finnEksisterendeMatch(paaby, kandidaterForMatch, { provider: external.provider })
    ?? (opprettetIDenneKjøringen?.has(paaby.id)
          ? { type: 'fuzzy', match: opprettetIDenneKjøringen.get(paaby.id) }
          : null);

  if (match?.type === 'url' || match?.type === 'kryss') {
    // Sterkt signal (samme lenke, eller samme event hos en annen kilde —
    // samme dag/tid/sted og nesten lik tittel) — lær koblingen, opprett
    // IKKE en ny candidate for noe vi allerede har.
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
    const hvorfor = match.type === 'url'
      ? 'samme lenke'
      : `samme event hos ${(match.match._providere ?? []).join('/') || 'kuratert'}`;
    console.log(`  [KOBLET] ${external.provider}:${external.externalId} → eksisterende «${match.match.tittel}» (${hvorfor})`);
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
  // Et «lignende»-treff (core/likhet.js) har vanligvis en annen legacy_id,
  // men kan kollidere når slugen blir lik — samme disambiguering da.
  const muligDuplikat = match?.type === 'fuzzy' || match?.type === 'lignende';
  const eventÅLagre = match?.type === 'fuzzy' || (match && match.match.id === paaby.id)
    ? { ...paaby, id: `${paaby.id}__${external.provider}-${external.externalId}` }
    : paaby;

  const vurdering = vurder(paaby, external.provider, { modell, regler, runId });

  const { candidateId, lagtTil } = await opprettCandidateOgRef({
    event: eventÅLagre,
    source: 'collector',
    muligDuplikat,
    duplikatHint: match ? byggDuplikatHint(match.match) : null,
    vurdering,
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
    if (vurdering.holdtUte) tellere.holdtUte = (tellere.holdtUte ?? 0) + 1;
    nyeFunn?.push({ candidateId, tittel: paaby.tittel, kilde: external.provider, holdtUte: vurdering.holdtUte });

    if (match?.type === 'fuzzy') {
      tellere.muligDuplikat++;
    } else {
      if (muligDuplikat) tellere.muligDuplikat++;
      // Den FØRSTE candidaten for denne legacy_id-en i denne kjøringen —
      // husk den slik at et senere event-i-samme-kjøring med samme
      // tittel+dato+sted blir fanget opp av sjekken over, i stedet for å
      // kollidere stille mot UNIQUE-constrainten. Hele eventet (start,
      // koordinater, kilde) lagres, så kryss-kilde-sjekken kan bruke det.
      opprettetIDenneKjøringen?.set(eventÅLagre.id, {
        ...eventÅLagre,
        _erCandidate: true, _dbId: candidateId, _providere: [external.provider],
      });
    }
  }
}

export async function behandleKilde(source, context) {
  const tellere = { nye: 0, uendret: 0, endret: 0, koblet: 0, avslått: 0, muligDuplikat: 0, holdtUte: 0, beriket: 0 };
  const horisontDager = context.horisontDager ?? MAX_DAGER_FREM;
  let feil = 0;
  let innenforHorisontAntall = 0;

  let eksternEventer;
  try {
    // dagerFrem lar adaptere med server-side datofilter (Ticketmaster) be
    // om akkurat det vinduet vi bruker, i stedet for å hente 30 dager.
    eksternEventer = await hentFraKilde({ ...source, dagerFrem: horisontDager });
  } catch (err) {
    console.error(`  FEIL ved henting: ${err.message}`);
    return { feil: 1 };
  }

  for (const external of eksternEventer) {
    const normalisert = normaliser(external);
    if (!normalisert.tittel || !normalisert.start) continue;
    if (!innenforHorisont(normalisert, new Date(), horisontDager)) continue;
    innenforHorisontAntall++;

    // Fyll inn adresse/koordinater fra steder vi allerede har kuratert
    // (venues) når kilden ikke oppgir dem — Tickster mangler f.eks. geo
    // for de fleste norske venues. Overskriver aldri kildens egne verdier.
    const { event: paaby, fylt } = berikFraKjentSted(normalisert, context.kjenteSteder);
    if (fylt.length) tellere.beriket++;

    try {
      await behandleEvent(external, paaby, { ...context, tellere });
    } catch (err) {
      console.error(`  FEIL ved behandling av «${paaby.tittel}»: ${err.message}`);
      feil++;
    }
  }

  console.log(`  Hentet: ${eksternEventer.length}`);
  console.log(`  Innenfor ${horisontDager}-dagers horisont: ${innenforHorisontAntall}`);
  console.log(`  Nye: ${tellere.nye}`);
  console.log(`  Endret: ${tellere.endret}`);
  console.log(`  Uendret: ${tellere.uendret}`);
  console.log(`  Koblet til eksisterende (samme lenke / samme event hos annen kilde): ${tellere.koblet}`);
  console.log(`  Mulige duplikater (ny candidate, flagget): ${tellere.muligDuplikat}`);
  console.log(`  Holdt ute av agenten (nye): ${tellere.holdtUte}`);
  console.log(`  Adresse/koordinater fylt fra kjent sted: ${tellere.beriket}`);
  console.log(`  Droppet (avslått tidligere): ${tellere.avslått}`);
  console.log(`  Feil: ${feil}`);

  return { ...tellere, hentet: eksternEventer.length, innenforHorisont: innenforHorisontAntall, feil };
}

/**
 * Trener interesse-modellen på alt Påby har bestemt så langt (se
 * core/interesse.js) — på nytt hver kjøring, ingen lagret modell.
 */
export async function lagModell() {
  const [rader, ventende] = await Promise.all([lesTreningsdata(), lesVentendeCollectorFunn()]);
  const eksempler = rader
    .map((r) => ({
      egenskaper: trekkUtEgenskaper(r, { provider: r.provider }),
      utfall: merkUtfall(r),
    }))
    .filter((e) => e.utfall);

  // Bakgrunn: ubehandlede funn, svakt negative (se BAKGRUNNSVEKT). Uten
  // kilde-egenskap — at Ticketmaster leverer flest events er volum, ikke
  // smak, og skal ikke trekke Ticketmaster-events ned.
  for (const rad of ventende) {
    if (rad.included_manually) continue;
    eksempler.push({ egenskaper: trekkUtEgenskaper(rad.payload), utfall: 'negativ', bakgrunn: true });
  }

  return trenModell(eksempler);
}

/**
 * Scorer ALLE ventende collector-funn på nytt med dagens modell — også de
 * fra tidligere kjøringer, slik at «Fra API» blir bedre sortert for hver
 * beslutning som tas. Returnerer de oppdaterte radene for oppsummeringen.
 */
export async function scorVentendePåNytt({ modell, regler }) {
  const antallAvslag = modell?.antall?.avslått ?? 0;
  const ventende = await lesVentendeCollectorFunn();
  const ut = [];
  for (const rad of ventende) {
    const v = vurder(rad.payload, rad.provider, { modell, regler });
    // Lagt i utvalget av en person → holdes aldri ute igjen av en regel.
    if (rad.included_manually) v.holdtUte = null;
    await oppdaterVurdering(rad.id, v);
    const valg = agentensValg({ score: v.score, holdtUte: v.holdtUte, inkludertManuelt: rad.included_manually, antallAvslag });
    // id = candidate-UUID (ikke payloadens legacy id) — matcher nyeFunn.
    ut.push({ ...rad.payload, id: rad.id, kilde: rad.provider, ...v, valg });
  }
  return ut;
}

const UKEDAG_KORT = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'];

// Lesbar gjennomgang av «Fra API» for de neste N dagene: dag for dag,
// mest interessante først. Det er dette man ser i Heroku-loggen etter en
// automatisk kjøring.
export function skrivOppsummering(ventende, { horisontDager, nyeIder = new Set(), nå = new Date() }) {
  const maks = new Date(nå.getTime() + horisontDager * 24 * 60 * 60 * 1000);
  const innenfor = ventende
    .filter((e) => e.start && new Date(e.start) >= nå && new Date(e.start) <= maks)
    .sort((a, b) =>
      a.start.slice(0, 10).localeCompare(b.start.slice(0, 10))
      || (b.score ?? -1) - (a.score ?? -1)
      || new Date(a.start) - new Date(b.start));

  // Samme tre grupper som «Fra API» (core/interesse.js:agentensValg).
  // Eldre kall uten valg (f.eks. tester) faller tilbake på holdtUte.
  const gruppe = (e) => e.valg ?? (e.holdtUte ? 'ikke-valgt' : 'valgt');
  const valgt = innenfor.filter((e) => gruppe(e) === 'valgt');
  const usikre = innenfor.filter((e) => gruppe(e) === 'usikker');
  const ikkeValgt = innenfor.filter((e) => gruppe(e) === 'ikke-valgt');

  console.log(`Fra API — neste ${horisontDager} dager: ${valgt.length} i agentens utvalg, ${usikre.length} usikre, ${ikkeValgt.length} ikke valgt`);

  let forrigeDag = null;
  for (const e of valgt) {
    const dag = e.start.slice(0, 10);
    if (dag !== forrigeDag) {
      const d = new Date(`${dag}T12:00:00Z`);
      console.log(`\n  ${UKEDAG_KORT[d.getUTCDay()]} ${dag}`);
      forrigeDag = dag;
    }
    console.log(`   ${linje(e, nyeIder)}`);
  }

  if (usikre.length) {
    console.log('\n  Usikre (Fra API → «Usikre»):');
    for (const e of usikre) console.log(`   ${linje(e, nyeIder)}`);
  }

  if (ikkeValgt.length) {
    console.log('\n  Ikke valgt (Fra API → «Ikke valgt»):');
    for (const e of ikkeValgt) {
      console.log(`     ${e.start.slice(0, 10)}  ${e.tittel} — ${e.holdtUte ?? `lav relevans (${Math.round(e.score)})`}`);
    }
  }
}

function linje(e, nyeIder) {
  const score = e.score == null ? '  –' : String(Math.round(e.score)).padStart(3);
  const ny = nyeIder.has(e.id) ? ' NY' : '';
  const mangler = e.mangler?.length ? `  [mangler: ${e.mangler.join(', ')}]` : '';
  return `${score}${ny}  ${e.start.slice(11, 16)}  ${e.tittel} — ${e.sted ?? '?'} (${e.kilde ?? '?'})${mangler}`;
}

export async function main({ horisontDager = lesHorisontDager() } = {}) {
  console.log('─'.repeat(50));
  console.log(`paaby-collector — neste ${horisontDager} dager`);
  console.log('─'.repeat(50));

  const [candidatesRaw, rejected, publiserteRaw, modell, kjenteSteder] = await Promise.all([
    lesCandidates(),
    lesRejected(),
    lesPubliserte(),
    lagModell(),
    lesKjenteSteder(),
  ]);
  const regler = { holdUte: HOLD_UTE, alltidMed: ALLTID_MED };
  const runId = await startKjøring(horisontDager);

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
  const nyeFunn = [];

  console.log(`Eksisterende: ${publiserteRaw.length} publisert, ${candidatesRaw.length} i kø, ${rejected.length} avslått`);
  console.log(`Agenten lærer av ${modell.antall.med + modell.antall.avslått} beslutninger (${modell.antall.med} med, ${modell.antall.avslått} avslått), sammenlignet med ${modell.antall.bakgrunn} ubehandlede funn\n`);

  let totaltNye = 0;
  const statsPerKilde = {};

  for (const source of SOURCES) {
    console.log('─'.repeat(50));
    console.log(`${source.id} (adapter=${source.adapter})`);
    console.log('─'.repeat(50));

    if (skalHoppeOverKilde(source)) {
      console.log(`[hopper over] ${source.id} – mangler ${source.tokenEnv}\n`);
      statsPerKilde[source.id] = { hoppetOver: source.tokenEnv };
      continue;
    }

    const resultat = await behandleKilde(source, {
      avslåtteIder, eksisterende, opprettetIDenneKjøringen,
      horisontDager, kjenteSteder, modell, regler, runId, nyeFunn,
    });
    statsPerKilde[source.id] = resultat;
    totaltNye += resultat.nye ?? 0;
    console.log('');

    // God skikk: liten pause mellom kilder slik at vi ikke hamrer servere
    await new Promise((r) => setTimeout(r, 500));
  }

  const ventende = await scorVentendePåNytt({ modell, regler });

  console.log('─'.repeat(50));
  skrivOppsummering(ventende, { horisontDager, nyeIder: new Set(nyeFunn.map((f) => f.candidateId)) });
  console.log('');

  await avsluttKjøring(runId, {
    stats: { kilder: statsPerKilde, nye: totaltNye, ventende: ventende.length },
    treningsstørrelse: modell.antall.med + modell.antall.avslått,
  });

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
  main()
    .then(() => pool.end())
    .catch((err) => {
      console.error('\nUventet feil:', err.message);
      process.exit(1);
    });
}
