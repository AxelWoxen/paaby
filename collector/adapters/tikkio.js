// Adapter for Tikkio sitt offentlige Discovery API v1.
// Dokumentert endepunkt: https://tikkio.com/api/public/v1/events
// Ingen API-nøkkel/autentisering kreves — bekreftet manuelt (HTTP 200, ekte
// Oslo-events) FØR denne adapteren ble skrevet.
//
// Strategi:
//  1. Spør med municipality_code (ikke city+municipality sammen — testet,
//     municipality_code=0301 alene gir allerede kun Oslo kommune).
//  2. starts_after/starts_before = i dag → +30 dager (samme horisont som
//     resten av collectoren håndhever uansett, se run.js).
//  3. Paginerer via meta.has_more_pages/meta.total_pages — dokumentert i
//     selve svaret, ikke gjettet.
//  4. Mapper hvert rå-event til den felles external-event-formen.

import { utcIsoTilOsloIso } from '../core/tid.js';
import { stripHtml }        from '../core/html.js';

// Tikkio sin CDN stempler bilde-URL-er med et bygg-/utrullingsversjonsnummer
// ("/static/1.0.3476/…") som endrer seg i løpet av minutter — UAVHENGIG av
// om selve eventet har endret seg. Oppdaget ved at samme event ga ulik
// content_hash to kjøringer på rad, kun fordi versjonssegmentet hadde
// endret seg. Bekreftet at segmentet er rent kosmetisk: både gammel,
// fremtidig og helt fjernet versjon gir fortsatt HTTP 200 på samme bilde.
// Fjernes derfor FØR URL-en brukes til både visning og content_hash, slik
// at et uendret bilde faktisk gir UNCHANGED neste kjøring.
function normaliserBildeUrl(url) {
  if (typeof url !== 'string' || !url) return null;
  return url.replace(/^(https?:\/\/cdn\.tikkio\.com)\/static\/[^/]+\//, '$1/');
}

const API_BASE   = 'https://tikkio.com/api/public/v1/events';
const USER_AGENT  = 'paaby-collector/0.1 (læringsprosjekt, kontakt: axwoxen@gmail.com)';
const MAKS_SIDER  = 20; // hardt tak — langt over det 20-per-side × 20 = 400 events trengs for Oslo/30 dager
const MAX_DAGER_FREM = 30; // samme horisont som run.js håndhever uansett

function tilDatoStreng(dato) {
  return dato.toISOString().slice(0, 10); // YYYY-MM-DD
}

async function hentSide(source, side) {
  const nå  = new Date();
  const til = new Date(nå.getTime() + MAX_DAGER_FREM * 24 * 60 * 60 * 1000);

  const params = new URLSearchParams({
    country:            source.country ?? 'NO',
    municipality_code:  source.municipalityCode,
    lang:               source.lang ?? 'no',
    include_membership: 'false',
    starts_after:       tilDatoStreng(nå),
    starts_before:      tilDatoStreng(til),
    page:                String(side),
  });

  const res = await fetch(`${API_BASE}?${params.toString()}`, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fra Tikkio Discovery API`);
  return res.json();
}

/**
 * Henter alle kommende events for én Tikkio-kommune, mappet til den felles
 * external-event-formen.
 */
export async function hentTikkioEvents(source) {
  const alle = [];
  let side = 1; // Tikkio sin paginering er 1-indeksert (meta.current_page starter på 1)

  while (true) {
    const data = await hentSide(source, side);
    alle.push(...(data.data ?? []));

    if (!data.meta?.has_more_pages || side >= MAKS_SIDER) break;
    side++;
    await new Promise((r) => setTimeout(r, 250)); // rate-limit-vennlig
  }

  return alle.map((e) => mapTikkioEvent(e, source));
}

// categories[].code → generiske kategori-hint. Hentet fra Tikkios egen
// /categories-endepunkt (bekreftet taksonomi, ikke gjettet): alt under
// "music"-grenen (music/music-*) og "festivals-music" er tydelig musikk.
// "community-nightlife" er Tikkios eget, eksplisitte nightlife-kategori —
// den eneste vi er trygge nok på til å kalle klubb direkte.
// "music-electronic-dance" hintes som konsert+electronic, slik at den
// (akkurat som for Broadcast/Ticketmaster) lander på klubb via
// normalize.js sin eksisterende konsert+electronic→klubb-regel.
// Alt annet som HAR en kategori, men ikke er musikk/nightlife, hintes med
// det ærlige 'other'-hintet (→ pafunn) — IKKE et falskt 'food'-hint.
function byggKategoriHint(råEvent) {
  const koder = (råEvent.categories ?? []).map((c) => String(c?.code ?? '').toLowerCase());
  const hints = [];

  if (koder.includes('community-nightlife')) hints.push('club');
  if (koder.includes('music-electronic-dance')) hints.push('electronic');

  const erMusikk = koder.some((k) => k === 'music' || k.startsWith('music-') || k === 'festivals-music');
  if (erMusikk) hints.push('concert');

  if (hints.length === 0 && koder.length > 0) hints.push('other');
  return hints;
}

// Tikkios status-felt er ofte null i praksis (ticket-tilgjengelighet, ikke
// nødvendigvis arrangement-livssyklus) — ingen av de observerte verdiene
// (few-tickets/sold-out/upcoming) betyr avlyst. Anta ALDRI at null betyr
// scheduled — map eksplisitt til 'unknown' slik at vi ikke later som vi vet
// noe vi ikke vet. Defensiv nøkkelordsjekk for cancel/avlyst i tilfelle
// Tikkio faktisk bruker et slikt ord i en fremtidig verdi vi ikke har sett.
function tilSourceStatus(status) {
  const verdi = String(status ?? '').toLowerCase();
  if (!verdi) return 'unknown';
  if (verdi.includes('cancel') || verdi.includes('avlyst') || verdi.includes('aflyst')) return 'cancelled';
  return 'scheduled';
}

/**
 * Mapper ett rå Tikkio-eventobjekt til den felles external-event-formen.
 * Ren funksjon (ingen I/O) — eksportert for testing.
 */
export function mapTikkioEvent(råEvent, source) {
  const venue = råEvent.venue ?? {};

  // minimum_price: 0 behandles som faktisk gratis (standard ticketing-
  // semantikk — "laveste billettpris" er 0 når en gratis billett finnes),
  // men null/undefined blir ALDRI 0 — det betyr "ukjent", ikke "gratis".
  const pris = typeof råEvent.minimum_price === 'number' ? råEvent.minimum_price : null;

  return {
    provider:   'tikkio',
    externalId: String(råEvent.id),
    sourceUrl:  råEvent.url ?? null, // IKKE organizer.website — det er arrangørens generelle hjemmeside, ikke event-siden, og ville gitt falske url-treff mot andre events fra samme arrangør
    sourceStatus: tilSourceStatus(råEvent.status),
    sourceUpdatedAt: null, // Tikkios Discovery API oppgir ikke noe "sist endret"-felt per event

    title:       råEvent.name?.trim() || null,
    description: stripHtml(råEvent.description_short || råEvent.description),

    start: utcIsoTilOsloIso(råEvent.starts_at),
    end:   utcIsoTilOsloIso(råEvent.ends_at),

    venue: {
      name:      venue.name?.trim() || null,
      address:   null, // Tikkio har ikke et eget adressefelt i venue — navnet inneholder noen ganger adressen i fritekst, men å parse det ut er for upresist til å stole på. Review fyller inn manuelt ved behov.
      latitude:  venue.latitude  ?? null,
      longitude: venue.longitude ?? null,
    },

    pricing: {
      min: pris,
      max: pris,
      currency: råEvent.currency ?? null,
      text: null,
    },

    imageUrl: normaliserBildeUrl(råEvent.image_url),

    categoryHints:   byggKategoriHint(råEvent),
    defaultCategory: source.defaultKategori ?? null,
  };
}
