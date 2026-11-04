// sync.js — rene beslutningsfunksjoner for kilde-synkronisering.
// Ingen DB, ingen fetch — alt som faktisk snakker med databasen ligger i
// store/external-event-refs.js og kalles fra run.js.
//
// ─── FELLES EXTERNAL-EVENT-FORM ─────────────────────────────────────────────
// Det en adapter returnerer PR EVENT, før normalize.js gjør det om til en
// påby-candidate. Alle felt er kildens egne — ingen Påby-spesifikk tolkning
// (kategori, prisTekst osv.) skal skje her.
//
//   {
//     provider,          // 'broadcast-events' | 'ticketmaster' | … — valgfri
//     externalId,        // kildens stabile event-id — valgfri, men sammen
//                        // med provider gir den sikker kildeidentitet
//     sourceUrl,         // kildens kanoniske lenke til eventet
//     sourceStatus,      // 'scheduled' | 'cancelled' | 'postponed' | 'unknown'
//     sourceUpdatedAt,   // ISO-streng fra kilden, eller null
//
//     title, description,
//     start, end,        // ISO med eksplisitt Oslo-offset
//
//     venue: { name, address, latitude, longitude },
//     pricing: { min, max, currency, text },
//     imageUrl,
//
//     categoryHints,     // generiske strenger adapteren mener sier noe om
//                        // kategori, f.eks. ['club', 'dj'] — IKKE Påbys
//                        // kategori-slugs. bestemKategori() i normalize.js
//                        // tolker disse.
//     defaultCategory,   // kildens/source-konfigens fallback-kategori når
//                        // categoryHints ikke gir noe klart svar
//   }
//
// Events uten provider/externalId er fortsatt gyldige — de faller tilbake
// til dagens rene innholds-hash-dedupe (dedupe.js), uten kilde-sporing.

import { lagHash } from '../dedupe.js';
import { sammenlign } from './likhet.js';

/**
 * Avgjør NEW / UNCHANGED / CHANGED for ett source-event med kjent identitet.
 *
 * @param {string}      nyHash           contentHash() av det ferske eventet
 * @param {Object|null} eksisterendeRef  rad fra event_sources, eller null
 * @returns {'NEW'|'UNCHANGED'|'CHANGED'}
 */
export function avgjorHandling(nyHash, eksisterendeRef) {
  if (!eksisterendeRef) return 'NEW';
  return eksisterendeRef.content_hash === nyHash ? 'UNCHANGED' : 'CHANGED';
}

/**
 * Sammenligner to content-snapshots (se core/hash.js:snapshotFelter) og
 * returnerer hvilke felt som faktisk endret seg — grunnlaget for
 * event_source_changes (se 011_event_source_changes.sql). Rent/pure: ingen
 * DB, ingen fetch.
 *
 * @param {Object|null} forrige  snapshot FØR (fra event_sources.content_snapshot), eller null hvis ingen er lagret ennå
 * @param {Object}      ny       snapshot NÅ (snapshotFelter() av det ferske eventet)
 * @returns {{ changedFields: string[], diff: Object<string, { fra: *, til: * }> }}
 */
export function diffSnapshots(forrige, ny) {
  const changedFields = [];
  const diff = {};

  for (const [felt, nyVerdi] of Object.entries(ny ?? {})) {
    const forrigeVerdi = forrige ? forrige[felt] : undefined;
    if (forrigeVerdi === nyVerdi) continue;
    changedFields.push(felt);
    diff[felt] = { fra: forrigeVerdi ?? null, til: nyVerdi };
  }

  return { changedFields, diff };
}

/**
 * Finner en eksisterende candidate/publisert-rad som matcher et NYTT
 * source-event (ingen event_sources-ref ennå) — brukes KUN for å lære en
 * kobling, aldri for å auto-overskrive data.
 *
 * Prioritet:
 *   1. samme lenke (sterkt signal — definitivt samme event)
 *   2. «kryss»: samme event hos en ANNEN kilde — samme dag, starttid innen
 *      30 min, nesten lik tittel og samme sted (core/likhet.js). Like
 *      sterkt som samme lenke: samme konsert solgt via Ticketmaster OG
 *      Tickster. Gjelder aldri to rader fra SAMME kilde — det er per
 *      definisjon to ulike kilde-eventer (f.eks. to visninger samme kveld).
 *   3. dagens tittel+dato+sted-hash (svakt signal — mulig duplikat)
 *   4. «lignende»: lik tittel samme dag, men ikke sikkert nok (svakt
 *      signal — mulig duplikat)
 *
 * @param {Object}   paabyEvent   output fra normalize.js sin normaliser()
 * @param {Object[]} eksisterende candidates+publiserte, hver med _erCandidate
 *                                (bool), _dbId (UUID) og _providere
 *                                (string[]) i tillegg til de vanlige
 *                                påby-feltene (se store/*.js)
 * @param {{ provider?: string|null }} [valg]  kilden det NYE eventet kommer fra
 * @returns {{ type: 'url'|'kryss'|'fuzzy'|'lignende', match: Object }|null}
 */
export function finnEksisterendeMatch(paabyEvent, eksisterende, { provider = null } = {}) {
  if (paabyEvent.lenke) {
    const urlTreff = eksisterende.find((e) => e.lenke && e.lenke === paabyEvent.lenke);
    if (urlTreff) return { type: 'url', match: urlTreff };
  }

  let lignende = null;
  for (const e of eksisterende) {
    const { nivå } = sammenlign(paabyEvent, e);
    if (!nivå) continue;
    // Uten kjent kilde for det nye eventet kan vi ikke vite at det er en
    // ANNEN kilde — da blir det aldri mer enn et mulig duplikat.
    const annenKilde = Boolean(provider) && !(e._providere ?? []).includes(provider);
    if (nivå === 'sikker' && annenKilde) return { type: 'kryss', match: e };
    lignende ??= e;
  }

  const nyHash = lagHash(paabyEvent);
  const fuzzyTreff = eksisterende.find((e) => lagHash(e) === nyHash);
  if (fuzzyTreff) return { type: 'fuzzy', match: fuzzyTreff };

  if (lignende) return { type: 'lignende', match: lignende };

  return null;
}
