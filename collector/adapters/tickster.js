// Adapter for Tickster sitt Event Dump API.
// Dokumentert endepunkt (metadata): https://api.tickster.com/{language-code}/api/{api-version}/events/dump/upcoming?key={api-key}
//
// BEKREFTET MOT EKTE API (2026-10-27), med TICKSTER_API_KEY fra env, read-only:
//  - language-code: KUN "sv" fungerer med denne nøkkelen (no/nb/nn/da/fi/de/is
//    gir alle HTTP 404). Dette styrer IKKE hvilke LAND dumpen inneholder —
//    dumpen har både svenske, danske, finske OG norske venues (bekreftet:
//    104 NO-venues i dumpen) — "sv" er bare den eneste aktiverte locale-
//    stien for akkurat denne nøkkelen. IKKE endre til "no"/"nb" uten å
//    bekrefte på nytt mot API-et først (ville gitt 404, 0 events).
//  - api-version: KUN "1.0" fungerer ("v1"/"1" gir 404).
//  - responsen fra metadata-endepunktet er { id, created, eTag, uri } som
//    dokumentert. uri peker til en S3-signert URL.
//  - SELVE DUMPEN: Content-Encoding: gzip, MEN Node sin native fetch()
//    (undici) dekomprimerer automatisk basert på denne headeren — res.json()
//    gir derfor ferdig parset JSON direkte, UTEN manuell zlib.gunzip. Bekreftet
//    ved at et manuelt gunzip-forsøk feiler ("incorrect header check") fordi
//    body allerede er dekomprimert når vi leser den.
//
// HIERARKI (collection/production/child-events) — bekreftet mot ekte data:
//  - childEvents nestet i en isCollectionEvent-rad er IKKE duplisert som egne
//    rader i dump.events — de finnes KUN der. Å bare hoppe over containere
//    med isCollectionEvent=true ville dermed slettet reelle, bookbare events
//    (f.eks. "Jæger" sin venue-samling inneholder de faktiske DJ-kveldene).
//  - productionParentId peker IKKE på noen id i denne dumpen (0 treff
//    observert) — opaque, ikke brukbart til å koble production-child tilbake
//    til sin "production"-rad. production-child-rader er likevel allerede
//    komplette, selvstendige, bookbare events (egen start/end/goods), så de
//    krever ingen slik kobling.
//  - Noen isCollectionEvent-rader med TOMME childEvents har likevel egne,
//    reelle goods (f.eks. et konsertevent som også er flagget collection av
//    andre grunner) — disse skal IKKE hoppes over.
//
// Konservativ regel (se byggFlatListe under), i denne prioriteringen:
//   1. isCollectionEvent + childEvents ikke-tom  → hopp over selve
//      beholderen, bruk i stedet hvert element i childEvents som sitt eget
//      external-event (de bærer en fullstendig embeddet `venue`-struktur,
//      IKKE en venueId-referanse — se byggVenueFraRaatt/map under).
//   2. isCollectionEvent + TOM childEvents + TOM goods → ren, tom beholder,
//      ingenting å hente ut. Hopp over.
//   3. Alt annet → behandles som et vanlig, selvstendig event.

import { utcIsoTilOsloIso } from '../core/tid.js';
import { stripHtml }        from '../core/html.js';

const API_BASE   = 'https://api.tickster.com';


// Oslo sentrum (59.9139, 10.7522) — samme punkt som Ticketmaster-adapterens
// geohash 'u4xsudv' tilsvarer (se config/sources.js). Tickster sin Event
// Dump har ingen server-side geo-parameter (det er en full dump, ikke et
// søk) — filtreringen må derfor skje her, client-side, i motsetning til
// Ticketmaster som lar Discovery API gjøre det selv.
const OSLO_SENTRUM = { lat: 59.9139, lng: 10.7522 };
const OSLO_RADIUS_KM = 25;

// Haversine — samme formel som js/application/posisjon.js (frontend,
// bruker-til-event-avstand), men duplisert lokalt her i stedet for
// importert: posisjon.js er en frontend-modul uten I/O, mens collectoren
// kjører i Node — å dele den ville krevd å flytte den til et nytt, delt
// sted bare for denne ene bruken, mer enn det faktiske behovet rettferdiggjør
// akkurat nå (se oppgavens "IKKE gjør store refactors").
function avstandKm(a, b) {
  const R = 6371;
  const tilRad = (g) => (g * Math.PI) / 180;
  const dLat = tilRad(b.lat - a.lat);
  const dLng = tilRad(b.lng - a.lng);
  const sin = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(tilRad(a.lat)) * Math.cos(tilRad(b.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(sin), Math.sqrt(1 - sin));
}

// Primærregel: NO + innenfor ~25 km av Oslo sentrum (geo). Fallback når geo
// mangler (bekreftet nødvendig: kun 28/104 norske venues i dumpen har geo i
// det hele tatt): normalisert city === "oslo". Ingen avansert kommune-/
// postnummerlogikk — bevisst, se oppgavebeskrivelsen.
export function erOsloVenue(venue) {
  if (!venue || venue.country !== 'NO') return false;

  const lat = venue.geo?.latitude;
  const lng = venue.geo?.longitude;
  if (typeof lat === 'number' && typeof lng === 'number') {
    return avstandKm(OSLO_SENTRUM, { lat, lng }) <= OSLO_RADIUS_KM;
  }

  return String(venue.city ?? '').trim().toLowerCase() === 'oslo';
}

async function hentMetadata(languageCode, apiVersion, apiKey) {
  const url = `${API_BASE}/${languageCode}/api/${apiVersion}/events/dump/upcoming?key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fra Tickster metadata-endepunkt`);
  return res.json();
}

async function hentDump(uri) {
  const res = await fetch(uri);
  if (!res.ok) throw new Error(`HTTP ${res.status} fra Tickster dump-URI`);
  return res.json();
}

// Slår sammen top-level-events og eventuelle utpakkede childEvents til ÉN
// flat liste, hver med sin egen venue allerede slått opp (se filhodets
// kommentar om hvorfor dette IKKE kan gjøres med en enkel .filter()).
//
// @param {Object[]} events    dump.events
// @param {Map<string,Object>} venueById  dump.venues indeksert på id
// @returns {{ event: Object, venue: Object|null }[]}
export function byggFlatListe(events, venueById) {
  const resultat = [];

  for (const e of events ?? []) {
    const goods = Array.isArray(e?.goods) ? e.goods : [];
    const children = Array.isArray(e?.childEvents) ? e.childEvents : [];

    if (e?.isCollectionEvent) {
      if (children.length > 0) {
        for (const barn of children) {
          // Barn bærer en fullstendig embeddet `venue`, ikke en venueId.
          resultat.push({ event: barn, venue: barn?.venue ?? null });
        }
        continue;
      }
      if (goods.length === 0) continue; // ren, tom beholder — ingenting å hente
    }

    resultat.push({ event: e, venue: venueById.get(e?.venueId) ?? null });
  }

  return resultat;
}

function tilSourceStatus(eventState) {
  if (eventState === 'Cancelled') return 'cancelled';
  if (!eventState) return 'unknown';
  return 'scheduled'; // ReleasedForSale/SaleEnded/NotReleased/SalePaused/ReleasedForNonPublicSale m.fl. — fortsatt et planlagt event, ikke avlyst
}

// goods[].type === 'ticket' er de eneste varene som faktisk representerer en
// billett til selve eventet (bekreftet: 'seasonoffer' finnes også, men er en
// sesongpakke, ikke en enkeltbillett til DETTE eventet). SoldOut er den
// eneste stockStatus-verdien som åpenbart betyr "ikke tilgjengelig" i det
// observerte datasettet (Undefined/Unknown/FewLeft/InStock er alle reelle
// eller i hvert fall ikke-utelukkende tilstander) — utelates derfor fra
// minimumspris-beregningen, resten telles med.
function finnMinimumspris(goods) {
  const tilgjengeligeTickets = (goods ?? [])
    .filter((g) => g?.type === 'ticket' && g?.stockStatus !== 'SoldOut');

  let min = null;
  for (const ticket of tilgjengeligeTickets) {
    const pris = Number(ticket?.price?.includingVat);
    if (!Number.isFinite(pris)) continue;
    if (min === null || pris < min) min = pris;
  }
  return min;
}

function finnCurrency(goods) {
  const medPris = (goods ?? []).find((g) => g?.type === 'ticket' && g?.price?.currency);
  return medPris?.price?.currency ?? null;
}

// tags/navn → generiske kategori-hint, samme vokabular som de andre
// adapterne (concert/club/dj/electronic/other — se normalize.js:bestemKategori).
// Bygget fra faktisk tag-frekvens i dumpen (2026-10-27): "teater"/"impro"/
// "humor"/"stand-up"/"barneforestilling" er klart IKKE musikk → 'other'.
// "house"/"techno"/"rave"/"dj"/"disco"/"nightclub"/"klubb" → klubb-signaler.
// "konsert"/"jazz"/"rock"/"worldmusic"/"funk" → musikk-signaler. Ukjente tags
// gir INGEN hint (→ source sin defaultKategori), ikke en gjettet kategori.
const KLUBB_NOKKELORD = ['house', 'techno', 'rave', 'disco', 'nightclub', 'klubb', 'dj', 'edm', 'drum&bass', 'dnb'];
const MUSIKK_NOKKELORD = ['konsert', 'concert', 'jazz', 'rock', 'worldmusic', 'funk', 'folk', 'pop', 'metal', 'indie'];
const PAFUNN_NOKKELORD = ['teater', 'impro', 'humor', 'comedy', 'stand-up', 'standup', 'barneforestilling', 'familie', 'kurs'];

function byggKategoriHint(råEvent) {
  const tags = (råEvent?.tags ?? []).map((t) => String(t).toLowerCase());
  const hints = [];

  if (tags.some((t) => KLUBB_NOKKELORD.some((k) => t.includes(k)))) hints.push('club');
  if (tags.some((t) => MUSIKK_NOKKELORD.some((k) => t.includes(k)))) hints.push('concert');
  if (hints.length === 0 && tags.some((t) => PAFUNN_NOKKELORD.some((k) => t.includes(k)))) hints.push('other');

  return hints;
}

/**
 * Mapper ett rå Tickster-eventobjekt (allerede koblet til sin venue, se
 * byggFlatListe) til den felles external-event-formen. Ren funksjon (ingen
 * I/O) — eksportert for testing. Leser KUN feltene vi faktisk bruker —
 * ukjente/nye felt fra Tickster ignoreres automatisk, krasjer aldri.
 */
export function mapTicksterEvent(råEvent, venue, source) {
  const e = råEvent ?? {};
  const goods = Array.isArray(e.goods) ? e.goods : [];

  return {
    provider:   'tickster',
    externalId: e.id != null ? String(e.id) : null,
    sourceUrl:  e.infoUri ?? null,
    sourceStatus: tilSourceStatus(e.eventState),
    sourceUpdatedAt: e.lastUpdated ?? null, // allerede ISO med offset fra kilden

    title:       typeof e.name === 'string' ? e.name.trim() || null : null,
    description: stripHtml(e.description),

    start: utcIsoTilOsloIso(e.start),
    end:   utcIsoTilOsloIso(e.end),

    venue: {
      name:      venue?.name?.trim() || null,
      address:   venue?.address || null,
      latitude:  typeof venue?.geo?.latitude  === 'number' ? venue.geo.latitude  : null,
      longitude: typeof venue?.geo?.longitude === 'number' ? venue.geo.longitude : null,
    },

    pricing: {
      min: finnMinimumspris(goods),
      max: null, // kun minimumspris etterspurt — se oppgavebeskrivelsen
      currency: finnCurrency(goods) ?? 'NOK', // norske events — NOK er en trygg default når goods ikke selv oppgir valuta
      text: null,
    },

    imageUrl: e.imageUrl || null,

    categoryHints:   byggKategoriHint(e),
    defaultCategory: source?.defaultKategori ?? null,
  };
}

/**
 * Henter hele Tickster Event Dump, filtrerer til Oslo-events, og mapper dem
 * til den felles external-event-formen. Hopper IKKE selv over manglende
 * API-key — det er run.js sin jobb (via source.tokenEnv), slik at alle
 * kilder følger samme generiske regel. Kalles adapteren likevel direkte uten
 * nøkkel, kastes en tydelig feil (fanget av run.js sin per-kilde try/catch).
 *
 * Ett ødelagt event-objekt skal ikke stoppe hele dumpen — mapTicksterEvent()
 * er allerede defensiv (alle felt er valgfrie), men vi filtrerer uansett
 * bort events uten gjenkjennelig venue/Oslo-tilhørighet FØR mapping, så en
 * eventuell feil der aldri når map-steget.
 */
export async function hentTicksterEvents(source) {
  const envNavn = source.tokenEnv ?? 'TICKSTER_API_KEY';
  const apiKey  = process.env[envNavn];
  if (!apiKey) throw new Error(`mangler ${envNavn}`);

  const languageCode = source.languageCode ?? 'sv'; // se filhodet — bekreftet, ikke "no"/"nb"
  const apiVersion   = source.apiVersion ?? '1.0';

  const metadata = await hentMetadata(languageCode, apiVersion, apiKey);
  // Opaque dump-id, kun logget — se oppgavebeskrivelsens "DUMP-ID"-avsnitt
  // og kommentaren i config/sources.js for hvordan den kan brukes senere.
  console.log(`  [tickster] dump id=${metadata.id} created=${metadata.created}`);

  const dump = await hentDump(metadata.uri);

  const venueById = new Map();
  for (const v of dump.venues ?? []) {
    if (v?.id) venueById.set(v.id, v);
  }

  const flatListe = byggFlatListe(dump.events, venueById);

  const osloListe = flatListe.filter(({ venue }) => erOsloVenue(venue));

  return osloListe.map(({ event, venue }) => mapTicksterEvent(event, venue, source));
}