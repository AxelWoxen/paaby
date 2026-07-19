// Lese/skrive-grensesnitt for data/rejected.json.
// Filen inneholder en flat array av event-id-strenger.
// Et event som havner her vil aldri dukke opp i candidates igjen.

import fs   from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIL       = path.join(__dirname, '..', '..', 'data', 'rejected.json');

// Leser listen. Returnerer tom array hvis filen ikke finnes ennå.
export async function lesRejected() {
  try {
    return JSON.parse(await fs.readFile(FIL, 'utf8'));
  } catch {
    return [];
  }
}

// Legger til én id. Ignorerer duplikater.
export async function leggTilRejected(id) {
  const liste = await lesRejected();
  if (!liste.includes(id)) {
    liste.push(id);
    await fs.writeFile(FIL, JSON.stringify(liste, null, 2) + '\n', 'utf8');
  }
}
