// Adapter for broadcast.events-plattformen.
// Mange norske venues (BLÅ, Rockefeller/Sentrum Scene m.fl.) kjører på denne
// plattformen og eksponerer events via en intern Next.js API-rute:
// /api/eventsEdge?venueId=...
//
// Strategi:
//  1. Hent /api/eventsEdge én gang og lagre til .cache/
//  2. Bruk cachen i CACHE_TTL_MS (6 timer) — gjør aldri mer enn ett nett-kall per kjøring
//  3. Map hvert rå API-objekt til den felles external-event-formen
//     (se collector/core/sync.js) — alt Broadcast-spesifikt (custom_fields,
//     tagsFlattened, photo/imagekit, place …) holdes her, normalize.js skal
//     aldri trenge å kjenne disse feltnavnene.

import fs   from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { utcIsoTilOsloIso } from '../core/tid.js';

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

// ─── Felt-for-felt mapping (alt Broadcast-spesifikt bor her) ───────────────

// Parser pris fra broadcast.events-feltene.
// freeEntry: true → 0. cover: "150 NOK" o.l. → tall. Ellers → null (ukjent).
function parsePris(cf) {
  if (cf.freeEntry === true) return 0;
  const cover = String(cf.cover ?? '').trim();
  const match = cover.match(/(\d+)/);
  if (match) return parseInt(match[1], 10);
  return null;
}

// Henter beste tilgjengelige billett- / info-URL.
// Trimmer whitespace — noen ticketmaster-URLer i API-et har ledende mellomrom.
function hentKildeUrl(råEvent, source) {
  const cf  = råEvent.custom_fields ?? {};
  const url = (cf.ticketUrl ?? '').trim() || (cf.moreInfo ?? '').trim();
  if (url) return url;
  return source?.url ?? null; // fallback: venue-forsiden
}

function hentBilde(råEvent) {
  return råEvent.photo?.urls?.large ?? råEvent.imagekit?.url ?? null;
}

// custom_fields.type + tagsFlattened → generiske kategori-hint.
// normalize.js sin bestemKategori() tolker disse — se den filen for selve
// Påby-kategoriseringen. Listen her er bevisst de samme signalene som
// tidligere ble lest direkte fra Broadcast-feltene.
function hentKategoriHint(råEvent) {
  const type = (råEvent.custom_fields?.type ?? '').toLowerCase();
  const tags = (råEvent.tagsFlattened ?? '').toLowerCase();
  const hint = [type];
  if (tags.includes('dj'))        hint.push('dj');
  if (tags.includes('electronic')) hint.push('electronic');
  if (tags.includes('mat'))        hint.push('mat');
  if (tags.includes('food'))       hint.push('food');
  return hint.filter(Boolean);
}

// Broadcasts eventStatus-verdier (LIMITED/ONSALE/SOLDOUT/MOVED …) har per i
// dag ingen observert "avlyst"-verdi — så vi mapper defensivt på nøkkelord
// i stedet for å anta et fast sett med verdier vi ikke har sett ennå.
function tilSourceStatus(cf) {
  const status = String(cf.eventStatus ?? '').toLowerCase();
  if (status.includes('cancel') || status.includes('avlyst')) return 'cancelled';
  if (!status) return 'unknown';
  return 'scheduled';
}

/**
 * Mapper ett rå broadcast.events-objekt til den felles external-event-formen.
 * Ren funksjon (ingen I/O) — eksportert for testing.
 *
 * @param {Object} råEvent
 * @param {Object} source   ett objekt fra config/sources.js
 */
export function mapBroadcastEvent(råEvent, source) {
  const cf = råEvent.custom_fields ?? {};

  const stedFraApi    = råEvent.place?.name?.trim() || null;
  const adresseFraApi = råEvent.place
    ? [råEvent.place.address, råEvent.place.postal_code, råEvent.place.city]
        .filter(Boolean).join(', ')
    : null;

  const pris = parsePris(cf);

  return {
    provider:   'broadcast-events',
    externalId: String(råEvent.id),
    sourceUrl:  hentKildeUrl(råEvent, source),
    sourceStatus: tilSourceStatus(cf),
    sourceUpdatedAt: råEvent.updatedAt ?? null,

    title:       råEvent.name?.trim() || null,
    description: råEvent.details ?? null,

    start: utcIsoTilOsloIso(råEvent.start_time),
    end:   utcIsoTilOsloIso(cf.end_time),

    venue: {
      name:      stedFraApi ?? source.sted ?? null,
      address:   adresseFraApi || source.adresse || null,
      latitude:  råEvent.place?.latitude  ?? source.lat ?? null,
      longitude: råEvent.place?.longitude ?? source.lng ?? null,
    },

    pricing: {
      min: pris,
      max: pris,
      currency: 'NOK',
      text: null, // normalize.js genererer visningstekst ("Gratis"/"150 kr")
    },

    imageUrl: hentBilde(råEvent),

    categoryHints:  hentKategoriHint(råEvent),
    defaultCategory: source.defaultKategori ?? null,
  };
}

/**
 * Henter alle kommende events for én broadcast.events-venue, mappet til den
 * felles external-event-formen.
 *
 * @param {Object} source  ett objekt fra config/sources.js
 */
export async function hentBroadcastEvents(source) {
  const url = `${source.url}/api/eventsEdge?venueId=${source.venueId}&limit=100`;
  const råData = await hentMedCache(url, `broadcast-${source.venueId}`);
  return råData.map((e) => mapBroadcastEvent(e, source));
}
