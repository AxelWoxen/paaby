// Lese/skrive-grensesnitt for data/candidates.json.
// candidates.json er en flat array av events med et ekstra _status-felt:
//   "pending"  — venter på manuell review
//   "godkjent" — lagt inn i events.json
//   "avslatt"  — avvist, id er også i rejected.json

import fs   from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIL       = path.join(__dirname, '..', '..', 'data', 'candidates.json');

// Leser hele listen. Returnerer tom array hvis filen ikke finnes ennå.
export async function lesCandidates() {
  try {
    return JSON.parse(await fs.readFile(FIL, 'utf8'));
  } catch {
    return [];
  }
}

// Skriver hele listen tilbake til disk.
export async function skrivCandidates(liste) {
  await fs.writeFile(FIL, JSON.stringify(liste, null, 2) + '\n', 'utf8');
}

// Serialiserer alle skriveoperasjoner — hindrer race condition ved parallelle POSTs.
let skriveKø = Promise.resolve();

// Legger til nye events med status "pending" og returnerer antallet som ble lagt til.
export async function leggTilCandidates(nyeListe) {
  let antall = 0;
  skriveKø = skriveKø.then(async () => {
    const eksisterende = await lesCandidates();
    const medStatus    = nyeListe.map((e) => ({ ...e, _status: 'pending' }));
    await skrivCandidates([...eksisterende, ...medStatus]);
    antall = medStatus.length;
  });
  await skriveKø;
  return antall;
}
