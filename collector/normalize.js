// Mapper et external-event (felles form, se core/sync.js) til påby-eventformen.
// Kjenner INGEN kildespesifikke feltnavn (Broadcast/Ticketmaster/…) — det er
// adapterens jobb å allerede ha oversatt til external-event-formen. Prinsipp:
// hvert felt behandles uavhengig — et manglende felt gir null, ikke en
// krasj. Kaller du normaliser() med søppeldata, får du et event med mange
// null-felt, men ingen exception.

import { normaliserUrl } from './core/urls.js';

// ─── Hjelpefunksjoner ───────────────────────────────────────────────────────

// Lager en URL-vennlig slug av en norsk tekst
function slugify(tekst) {
  return String(tekst ?? '')
    .toLowerCase()
    .replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Genererer en stabil id på formen "sted-tittel-YYYY-MM-DD"
function lagId(tittel, sted, start) {
  const dato = (start ?? '').slice(0, 10) || 'ukjent';
  return `${slugify(sted)}-${slugify(tittel)}-${dato}`;
}

// Bestemmer påby-kategori utfra adapterens generiske categoryHints.
// defaultCategory (satt av adapteren fra source-konfigen) brukes når hints
// ikke gir noe klart svar.
function bestemKategori(categoryHints, defaultCategory) {
  const hints = new Set((categoryHints ?? []).map((h) => String(h).toLowerCase()));

  if (hints.has('club')) return 'klubb';
  if (hints.has('concert')) {
    // Utestedskonserter med DJ-fokus → klubb
    if (hints.has('dj') || hints.has('electronic')) return 'klubb';
    return 'musikk';
  }
  // Kategorien "mat" er fjernet fra påby — mat-/food-hintet innhold havner i pafunn.
  // 'other' er en ærlig, kildeuavhengig "dette er ikke musikk"-markør (brukt
  // av bl.a. Ticketmaster for segmenter som Arts & Theatre/Miscellaneous) —
  // ikke det samme som food/mat, men lander samme sted: pafunn.
  if (hints.has('food') || hints.has('mat') || hints.has('other')) return 'pafunn';
  return defaultCategory ?? 'musikk';
}

// ─── Hoved-normaliseringsfunksjon ────────────────────────────────────────────

// Mapper ett external-event til påby-eventformen.
// Alle felt som mangler eller er ugyldige settes til null.
export function normaliser(externalEvent) {
  const e       = externalEvent ?? {};
  const venue   = e.venue ?? {};
  const pricing = e.pricing ?? {};

  const tittel   = e.title?.trim() || null;
  const stedNavn = venue.name?.trim() || null;
  const pris     = pricing.min ?? null;

  return {
    id:           lagId(tittel ?? 'ukjent', stedNavn ?? 'ukjent', e.start),
    tittel,
    kategori:     bestemKategori(e.categoryHints, e.defaultCategory),
    sted:         stedNavn,
    adresse:      venue.address || null,
    lat:          venue.latitude  ?? null,
    lng:          venue.longitude ?? null,
    start:        e.start ?? null,
    slutt:        e.end ?? null,
    pris,
    prisTekst:    pricing.text ?? (pris === 0 ? 'Gratis' : pris ? `${pris} kr` : null),
    beskrivelse:  e.description?.slice(0, 400).trim() || null,
    kuratortekst: null, // fylles inn manuelt i review-grensesnittet
    lenke:        normaliserUrl(e.sourceUrl),
    bilde:        e.imageUrl || null,
    sistVerifisert: new Date().toISOString(),
  };
}

// Normaliserer en liste med external-events og dropper dem som mangler tittel eller start.
export function normaliserAlle(externalEventer) {
  return externalEventer
    .map(normaliser)
    .filter((e) => e.tittel && e.start);
}
