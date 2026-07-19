// Inngangspunkt for kollektoren.
// Kjør: node run.js  (eller: npm run collect fra collector/-mappen)
//
// Hva som skjer steg for steg:
//  1. Last inn eksisterende candidates, rejected og publiserte events
//  2. For hver kilde i config/sources.js: hent rå-data med riktig adapter
//  3. Normaliser rå-data til påby-form
//  4. Filtrer bort avslåtte id-er
//  5. Dedupliser mot det vi allerede har
//  6. Lagre nye events som "pending" i candidates.json
//  7. Skriv ut oppsummering og neste steg

import fs   from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { SOURCES }                           from './config/sources.js';
import { hentBroadcastEvents }               from './adapters/broadcast-events.js';
import { normaliserAlle }                    from './normalize.js';
import { dedupliser }                        from './dedupe.js';
import { lesCandidates, leggTilCandidates }  from './store/candidates.js';
import { lesRejected }                       from './store/rejected.js';

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const EVENTS_FIL  = path.join(__dirname, '..', 'data', 'events.json');

// Leser events.json (appens publiserte events). Returnerer [] hvis filen mangler.
async function lesPubliserte() {
  try {
    return JSON.parse(await fs.readFile(EVENTS_FIL, 'utf8'));
  } catch {
    return [];
  }
}

// Kaller riktig adapter basert på source.adapter-feltet.
async function hentRåData(source) {
  if (source.adapter === 'broadcast-events') return hentBroadcastEvents(source);
  throw new Error(`Ukjent adapter: "${source.adapter}"`);
}

async function main() {
  console.log('─'.repeat(50));
  console.log('paaby-collector');
  console.log('─'.repeat(50));

  // Last inn eksisterende data parallelt (tre uavhengige lesinger)
  const [candidates, rejected, publiserte] = await Promise.all([
    lesCandidates(),
    lesRejected(),
    lesPubliserte(),
  ]);

  // Slå sammen alt vi allerede kjenner til — brukes til hash-basert dedupe
  const eksisterende  = [...candidates, ...publiserte];
  const avslåtteIder  = new Set(rejected);

  console.log(`Eksisterende: ${publiserte.length} publisert, ${candidates.length} i kø, ${rejected.length} avslått\n`);

  let totaltNye = 0;

  for (const source of SOURCES) {
    console.log(`→ [${source.id}] adapter=${source.adapter}`);

    let råData;
    try {
      råData = await hentRåData(source);
    } catch (err) {
      console.error(`  FEIL ved henting: ${err.message}`);
      continue;
    }
    console.log(`  ${råData.length} rå-events hentet`);

    const normaliserte = normaliserAlle(råData);
    console.log(`  ${normaliserte.length} etter normalisering`);

    // Filtrer bort events som er avslått (bruker påby-id, ikke broadcast-id)
    const ikkeAvslåtte = normaliserte.filter((e) => !avslåtteIder.has(e.id));
    const droppetAvslåtte = normaliserte.length - ikkeAvslåtte.length;
    if (droppetAvslåtte > 0) console.log(`  ${droppetAvslåtte} droppet (avslått tidligere)`);

    const nye = dedupliser(ikkeAvslåtte, eksisterende);
    console.log(`  ${nye.length} nye (ikke sett før)`);

    if (nye.length > 0) {
      const antall = await leggTilCandidates(nye);
      console.log(`  ✓ ${antall} lagt til candidates.json`);
      totaltNye += antall;
    }

    // God skikk: liten pause mellom kilder slik at vi ikke hamrer servere
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log('\n' + '─'.repeat(50));
  console.log(`Ferdig. ${totaltNye} nye candidates.`);
  if (totaltNye > 0) {
    console.log('Neste steg: cd collector && npm run review');
    console.log('            åpne http://localhost:3001');
  } else {
    console.log('Ingenting nytt å reviewe.');
  }
  console.log('─'.repeat(50));
}

main().catch((err) => {
  console.error('\nUventet feil:', err.message);
  process.exit(1);
});
