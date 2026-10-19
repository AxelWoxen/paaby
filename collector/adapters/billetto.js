// Adapter for Billetto sitt offentlige Public Events API v3.
// Dokumentert endepunkt: https://billetto.no/api/v3/public/events
//
// VIKTIG, bekreftet av Billetto-support (2026-10-20): API-et er domene-
// skopet, IKKE land-skopet via parameter. billetto.no gir norske events,
// billetto.dk gir danske — det finnes ingen country_code-parameter. Tidligere
// forsøk mot billetto.dk (se commit-historie/notater) ga derfor et dansk
// datasett selv med alle dokumenterte geo-filtre satt — det var feil domene,
// ikke feil filter.
//
// Oslo-dekning verifisert live (2026-10-20) mot alle fire dokumenterte
// geografifelt (postal_code, macroregion, region, subregion):
//   - macroregion=Norge  → hele Norge (144/152 events), ubrukelig som filter
//   - region=Oslo og Viken → altfor bredt, drar med Østfold/Vestfold/Buskerud
//   - postal_code         → kun ETT postnummer per kall, upraktisk for en by
//   - subregion=Oslo      → 40 treff, nøyaktig Oslo (39 byen "Oslo" + 1 event
//                            feil-tagget city="Skien" men med Oslo-koordinater
//                            og subregion=Oslo — altså fortsatt reelt Oslo)
// subregion=Oslo er derfor valgt.
//
// Strategi:
//  1. key+secret hentes fra env (BILLETTO_API_KEY/BILLETTO_API_SECRET) —
//     aldri hardkodet, aldri logget. tokenEnv i config/sources.js dekker kun
//     API_KEY (run.js sin generiske enkelt-variabel-sjekk) — adapteren
//     verifiserer selv at SECRET også finnes, og kaster en tydelig feil hvis
//     ikke (samme defensive mønster som ticketmaster.js).
//  2. Ingen server-side datofilter finnes (bekreftet: starts_after endrer
//     ikke treffantallet) — henter alt for subregion og lar run.js sin
//     globale 30-dagers horisont gjøre resten, samme mønster som øvrige
//     adaptere.
//  3. Paginerer via has_more/next_url (kursor-basert, next_url er en
//     ferdig-bygget URL) — hardt tak på antall sider som sikkerhetsnett.
//  4. Mapper hvert rå-event til den felles external-event-formen.

import { utcIsoTilOsloIso } from '../core/tid.js';
import { stripHtml }        from '../core/html.js';

const API_BASE   = 'https://billetto.no/api/v3/public/events';
const USER_AGENT = 'paaby-collector/0.1 (læringsprosjekt, kontakt: axwoxen@gmail.com)';
const SIDE_STØRRELSE = 100; // API-ets dokumenterte maks per side
const MAKS_SIDER     = 10;  // hardt tak — langt over det Oslo/subregion trenger i dag (~40)

async function hentFørsteSide(source, apiKeypair) {
  const params = new URLSearchParams({ limit: String(SIDE_STØRRELSE) });
  if (source.subregion) params.set('subregion', source.subregion);

  const res = await fetch(`${API_BASE}?${params.toString()}`, {
    headers: { 'Api-Keypair': apiKeypair, 'User-Agent': USER_AGENT },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fra Billetto Public Events API`);
  return res.json();
}

async function hentNesteSide(nextUrl, apiKeypair) {
  const res = await fetch(nextUrl, {
    headers: { 'Api-Keypair': apiKeypair, 'User-Agent': USER_AGENT },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fra Billetto Public Events API`);
  return res.json();
}

/**
 * Henter alle kommende events for én Billetto-kilde, mappet til den felles
 * external-event-formen. Hopper IKKE selv over manglende API-nøkkel for
 * BILLETTO_API_KEY — det er run.js sin jobb (via source.tokenEnv). Verifiserer
 * derimot selv at BILLETTO_API_SECRET også finnes, siden run.js sin generiske
 * tokenEnv-sjekk kun dekker én env-variabel.
 */
export async function hentBillettoEvents(source) {
  const envNavnKey    = source.tokenEnv ?? 'BILLETTO_API_KEY';
  const apiKey        = process.env[envNavnKey];
  const apiSecret     = process.env.BILLETTO_API_SECRET;
  if (!apiKey)    throw new Error(`mangler ${envNavnKey}`);
  if (!apiSecret) throw new Error('mangler BILLETTO_API_SECRET');
  const apiKeypair = `${apiKey}:${apiSecret}`;

  const alle = [];
  let data = await hentFørsteSide(source, apiKeypair);
  alle.push(...(data.data ?? []));

  let side = 1;
  while (data.has_more && data.next_url && side < MAKS_SIDER) {
    await new Promise((r) => setTimeout(r, 250)); // rate-limit-vennlig
    data = await hentNesteSide(data.next_url, apiKeypair);
    alle.push(...(data.data ?? []));
    side++;
  }

  return alle.map((e) => mapBillettoEvent(e, source));
}

// categorization.category/subcategory/type → generiske kategori-hint.
// Kun category === 'music' gir 'concert' — alt annet (performing_arts,
// food_drink, family, community, osv.) er ærlig 'other' → pafunn, selv når
// type er "concert" eller "party" på en ikke-musikk-kategori (f.eks.
// fashion_beauty/concert, food_drink/beer/party) — det er ikke musikk, og
// skal ikke late som det.
// Innenfor music: type === 'party' ELLER en elektronisk subkategori
// (house/techno/edm_electronic) hintes som 'electronic' — observert i det
// norske datasettet (2026-10-20) som Billettos dansbare klubbkveld-mønster
// (DJ-sett, ikke sittende konsert) — matcher normalize.js sin eksisterende
// konsert+electronic→klubb-regel.
function byggKategoriHint(råEvent) {
  const category    = råEvent.categorization?.category ?? null;
  const subcategory = String(råEvent.categorization?.subcategory ?? '').toLowerCase();
  const type         = råEvent.categorization?.type ?? null;
  const hints = [];

  if (category !== 'music') {
    hints.push('other');
    return hints;
  }

  hints.push('concert');
  const elektroniskSubkategori = ['house', 'techno', 'edm_electronic'].includes(subcategory);
  if (type === 'party' || elektroniskSubkategori) hints.push('electronic');
  return hints;
}

// Billettos 'state'-felt (bekreftet i dokumentasjon: published/draft/
// canceled/completed). Public-API-et har i praksis kun returnert
// 'published' i live-testing — defensiv nøkkelordsjekk for cancel/avlyst i
// tilfelle andre verdier faktisk forekommer, samme mønster som tikkio.js.
function tilSourceStatus(state) {
  const verdi = String(state ?? '').toLowerCase();
  if (verdi.includes('cancel') || verdi.includes('avlyst')) return 'cancelled';
  if (verdi === 'published') return 'scheduled';
  return 'unknown';
}

function byggAdresse(location) {
  const linje1 = location?.address_line?.trim() || '';
  const linje2 = location?.address_line_2?.trim() || '';
  const adresse = [linje1, linje2].filter(Boolean).join(', ');
  return adresse || null;
}

/**
 * Mapper ett rå Billetto-eventobjekt til den felles external-event-formen.
 * Ren funksjon (ingen I/O) — eksportert for testing.
 */
export function mapBillettoEvent(råEvent, source) {
  const location = råEvent.location ?? {};

  // Billettos felt heter "amount_in_cents", men verdiene observert live
  // (2026-10-20, f.eks. 300/295/150/50 NOK) er for små til faktisk å være
  // øre — det er hele kroner til tross for feltnavnet. Bekreftet mot
  // ekte prisede Oslo-events, ikke gjettet. Delt derfor IKKE på 100.
  const pris = typeof råEvent.minimum_price?.amount_in_cents === 'number'
    ? råEvent.minimum_price.amount_in_cents
    : null;

  return {
    provider:   'billetto',
    externalId: String(råEvent.id),
    sourceUrl:  råEvent.url ?? null, // originale URL-en, inkl. UTM — strippes ALDRI (normaliserUrl beholder query params)
    sourceStatus: tilSourceStatus(råEvent.state),
    sourceUpdatedAt: null, // Public Events API oppgir ikke noe "sist endret"-felt per event

    title:       råEvent.title?.trim() || null,
    description: stripHtml(råEvent.description),

    start: utcIsoTilOsloIso(råEvent.startdate),
    end:   utcIsoTilOsloIso(råEvent.enddate),

    venue: {
      name:      location.location_name?.trim() || null,
      address:   byggAdresse(location),
      latitude:  location.coordinates?.latitude  ?? null,
      longitude: location.coordinates?.longitude ?? null,
    },

    pricing: {
      min: pris,
      max: pris,
      currency: råEvent.minimum_price?.currency ?? null,
      text: null,
    },

    imageUrl: råEvent.image_link || null,

    categoryHints:   byggKategoriHint(råEvent),
    defaultCategory: source.defaultKategori ?? null,
  };
}
