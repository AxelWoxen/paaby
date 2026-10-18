// Adapter for Ticketmaster Discovery API v2.
// Offisiell dokumentasjon: https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/
//
// IKKE testet mot det ekte API-et i denne omgang (ingen TICKETMASTER_API_KEY
// tilgjengelig i dette prosjektet) — kun bygget mot den offentlige, stabile
// kontrakten (endepunkt, auth, _embedded.events-formen, dates/classifications/
// priceRanges/_embedded.venues). Bør kjøres mot en ekte nøkkel og verifiseres
// før den brukes i produksjon.
//
// Strategi:
//  1. apikey hentes fra source.tokenEnv (default 'TICKETMASTER_API_KEY') —
//     aldri hardkodet, aldri logget.
//  2. Henter events for de neste MAX_DAGER_FREM dagene (samme horisont som
//     resten av collectoren håndhever uansett, se run.js).
//  3. Paginerer forsiktig (liten pause mellom sider, hardt tak på antall
//     sider) — Discovery API har et dagskvantum og rate-limit per sekund.
//  4. Mapper hvert rå-event til den felles external-event-formen.

import { utcIsoTilOsloIso } from '../core/tid.js';

const API_BASE   = 'https://app.ticketmaster.com/discovery/v2/events.json';
const USER_AGENT = 'paaby-collector/0.1 (læringsprosjekt, kontakt: axwoxen@gmail.com)';
const SIDE_STØRRELSE = 50;
const MAKS_SIDER      = 10; // hardt tak — aldri mer enn 500 events per kjøring
const MAX_DAGER_FREM  = 30; // samme horisont som run.js håndhever uansett

function tilApiTidspunkt(dato) {
  // Discovery API vil ha UTC uten offset, format YYYY-MM-DDTHH:mm:ssZ
  return dato.toISOString().slice(0, 19) + 'Z';
}

async function hentSide(source, apiKey, side) {
  const nå  = new Date();
  const til = new Date(nå.getTime() + MAX_DAGER_FREM * 24 * 60 * 60 * 1000);

  const params = new URLSearchParams({
    apikey: apiKey,
    countryCode: source.countryCode ?? 'NO',
    size: String(SIDE_STØRRELSE),
    page: String(side),
    sort: 'date,asc',
    startDateTime: tilApiTidspunkt(nå),
    endDateTime: tilApiTidspunkt(til),
  });
  if (source.city) params.set('city', source.city);

  const res = await fetch(`${API_BASE}?${params.toString()}`, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fra Ticketmaster Discovery API`);
  return res.json();
}

/**
 * Henter alle kommende events for én Ticketmaster-kilde, mappet til den
 * felles external-event-formen. Hopper IKKE selv over manglende API-key —
 * det er run.js sin jobb (via source.tokenEnv), slik at alle kilder følger
 * samme generiske regel. Kalles adapteren likevel direkte uten nøkkel,
 * kastes en tydelig feil (fanget av run.js sin per-kilde try/catch).
 */
export async function hentTicketmasterEvents(source) {
  const envNavn = source.tokenEnv ?? 'TICKETMASTER_API_KEY';
  const apiKey  = process.env[envNavn];
  if (!apiKey) throw new Error(`mangler ${envNavn}`);

  const alle = [];
  let side = 0;
  let totaltSider = 1;

  do {
    const data   = await hentSide(source, apiKey, side);
    const events = data._embedded?.events ?? [];
    alle.push(...events);

    totaltSider = data.page?.totalPages ?? 1;
    side++;

    if (side < totaltSider && side < MAKS_SIDER) {
      await new Promise((r) => setTimeout(r, 250)); // rate-limit-vennlig
    }
  } while (side < totaltSider && side < MAKS_SIDER);

  return alle.map((e) => mapTicketmasterEvent(e, source));
}

// classifications[0].segment/genre → generiske kategori-hint.
// Ticketmasters segment/genre-navn ("Music", "Arts & Theatre", "Dance/
// Electronic" …) er ikke de samme ordene som Broadcast bruker —
// normalize.js sin bestemKategori() kjenner uansett bare generiske hint
// som 'concert'/'dj'/'electronic'/'other' (→ pafunn), så vi oversetter her.
//
// 'other' — IKKE 'food' — for alt som ikke er segment "Music": Arts &
// Theatre er ikke mat, og å late som det er det ville bare blitt dårligere
// jo flere adaptere som gjenbruker det samme hintet uærlig. 'other' er en
// ren generisk "dette er ikke musikk"-markør. Grov heuristikk med vilje:
// Discovery API sine segmenter matcher ikke Påbys tre kategorier 1-til-1,
// og dette er fortsatt bare en trygg default — review korrigerer resten.
function byggKategoriHint(råEvent) {
  const segment = råEvent.classifications?.[0]?.segment?.name?.toLowerCase() ?? '';
  const genre   = råEvent.classifications?.[0]?.genre?.name?.toLowerCase()   ?? '';
  const hints   = [];
  if (segment === 'music') {
    hints.push('concert');
  } else if (segment) {
    hints.push('other');
  }
  if (genre.includes('dance') || genre.includes('electronic')) hints.push('electronic');
  if (genre.includes('dj'))                                 hints.push('dj');
  return hints;
}

function tilSourceStatus(code) {
  if (code === 'cancelled') return 'cancelled';
  if (code === 'postponed' || code === 'rescheduled') return 'postponed';
  if (!code) return 'unknown';
  return 'scheduled'; // onsale/offsale m.fl. — fortsatt et planlagt event
}

function velgBesteBilde(images) {
  if (!Array.isArray(images) || images.length === 0) return null;
  const sortert = [...images].sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  return sortert[0]?.url ?? null;
}

/**
 * Mapper ett rå Ticketmaster Discovery-eventobjekt til den felles
 * external-event-formen. Ren funksjon (ingen I/O) — eksportert for testing.
 */
export function mapTicketmasterEvent(råEvent, source) {
  const venue          = råEvent._embedded?.venues?.[0] ?? {};
  const prisintervall   = råEvent.priceRanges?.[0] ?? null;

  return {
    provider:   'ticketmaster',
    externalId: råEvent.id,
    sourceUrl:  råEvent.url ?? null,
    sourceStatus: tilSourceStatus(råEvent.dates?.status?.code),
    sourceUpdatedAt: null, // Discovery API oppgir ikke noe entydig "sist endret"-felt per event

    title:       råEvent.name?.trim() || null,
    description: råEvent.info || råEvent.pleaseNote || null,

    start: råEvent.dates?.start?.dateTime ? utcIsoTilOsloIso(råEvent.dates.start.dateTime) : null,
    end:   null, // Discovery API oppgir normalt ikke sluttidspunkt

    venue: {
      name:      venue.name ?? null,
      address:   venue.address?.line1 ?? null,
      latitude:  venue.location?.latitude  != null ? Number(venue.location.latitude)  : null,
      longitude: venue.location?.longitude != null ? Number(venue.location.longitude) : null,
    },

    pricing: {
      min: prisintervall?.min ?? null,
      max: prisintervall?.max ?? null,
      currency: prisintervall?.currency ?? null,
      text: null,
    },

    imageUrl: velgBesteBilde(råEvent.images),

    categoryHints:   byggKategoriHint(råEvent),
    defaultCategory: source.defaultKategori ?? null,
  };
}
