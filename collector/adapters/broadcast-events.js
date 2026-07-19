// Adapter for broadcast.events-plattformen.
// Mange norske venues (BLÅ, Jaeger m.fl.) kjører på denne plattformen og
// eksponerer events via en intern Next.js API-rute: /api/eventsEdge?venueId=...
//
// Strategi:
//  1. Hent /api/eventsEdge én gang og lagre til .cache/
//  2. Bruk cachen i CACHE_TTL_MS (6 timer) — gjør aldri mer enn ett nett-kall per kjøring
//  3. Returner rå API-objekter med _source påklistret for normalize.js

import fs   from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR   = path.join(__dirname, '..', '.cache');
const USER_AGENT  = 'paaby-collector/0.1 (læringsprosjekt, kontakt: axwoxen@gmail.com)';
const CACHE_TTL   = 6 * 60 * 60 * 1000; // 6 timer i ms

// Henter en URL og mellomlagrer svaret som JSON.
// Returnerer parset objekt — enten fra disk eller fra nettet.
async function hentMedCache(url, cacheNøkkel) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const cacheFil = path.join(CACHE_DIR, `${cacheNøkkel}.json`);

  // Bruk cache hvis filen er fersk nok
  try {
    const { mtimeMs } = await fs.stat(cacheFil);
    if (Date.now() - mtimeMs < CACHE_TTL) {
      console.log(`  [cache] ${cacheNøkkel} (< 6t gammel)`);
      return JSON.parse(await fs.readFile(cacheFil, 'utf8'));
    }
  } catch {
    // Ingen cache-fil ennå — fall through til nett-kall
  }

  console.log(`  [henter] ${url}`);
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fra ${url}`);

  const data = await res.json();
  await fs.writeFile(cacheFil, JSON.stringify(data, null, 2), 'utf8');
  return data;
}

// Henter alle kommende events for én broadcast.events-venue.
// source: ett objekt fra config/sources.js
// Returnerer array av rå API-objekter med _source satt.
export async function hentBroadcastEvents(source) {
  const url = `${source.url}/api/eventsEdge?venueId=${source.venueId}&limit=100`;
  const råData = await hentMedCache(url, `broadcast-${source.venueId}`);

  // Klistrer på source-objektet så normalize.js vet hvilken venue dette kom fra
  return råData.map((e) => ({ ...e, _source: source }));
}
