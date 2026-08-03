// Mapper rå API-objekter til påby-eventformen.
// Prinsipp: hvert felt behandles uavhengig — et manglende felt gir null,
// ikke en krasj. Kaller du normaliser() med søppeldata, får du et event
// med mange null-felt, men ingen exception.

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

// Konverterer en UTC ISO-streng til norsk tid med korrekt DST-offset.
// Bruker Intl.DateTimeFormat for å slippe å hardkode +02:00.
function tilNorskTid(isoStreng) {
  if (!isoStreng) return null;
  try {
    const d = new Date(isoStreng);
    if (isNaN(d)) return null;

    // Hent lokal tidsdeler i Oslo-tidssone
    const deler = new Intl.DateTimeFormat('fr-CA', {
      timeZone:  'Europe/Oslo',
      year:      'numeric',
      month:     '2-digit',
      day:       '2-digit',
      hour:      '2-digit',
      minute:    '2-digit',
      second:    '2-digit',
      hour12:    false,
    }).formatToParts(d);

    const f = (type) => deler.find((p) => p.type === type)?.value ?? '00';
    const lokalISO = `${f('year')}-${f('month')}-${f('day')}T${f('hour')}:${f('minute')}:${f('second')}`;

    // Beregn faktisk offset ved å sammenligne UTC og tolket lokal tid
    // new Date(lokalISO + 'Z') leser strengen som om den var UTC
    const diff    = new Date(lokalISO + 'Z') - d;
    const timer   = Math.round(diff / 3_600_000);
    const fortegn = timer >= 0 ? '+' : '-';
    const offset  = `${fortegn}${String(Math.abs(timer)).padStart(2, '0')}:00`;

    return lokalISO + offset;
  } catch {
    return null;
  }
}

// Bestemmer påby-kategori utfra broadcast.events-typefeltet og tags.
// defaultKategori brukes når vi ikke klarer å bestemme noe bedre.
function bestemKategori(råEvent, defaultKategori) {
  const type = (råEvent.custom_fields?.type ?? '').toLowerCase();
  const tags = (råEvent.tagsFlattened ?? '').toLowerCase();

  if (type === 'club')    return 'klubb';
  if (type === 'concert') {
    // Utestedskonserter med DJ-fokus → klubb
    if (tags.includes('dj') || tags.includes('electronic')) return 'klubb';
    return 'musikk';
  }
  // Kategorien "mat" er fjernet fra påby — mat-/food-tagget innhold havner nå i pafunn.
  if (type === 'food' || tags.includes('mat') || tags.includes('food')) return 'pafunn';
  return defaultKategori ?? 'musikk';
}

// Parser pris fra broadcast.events-feltene.
// freeEntry: true → 0
// cover: "150 NOK" o.l. → tall
// Ellers → null (ukjent)
function parsePris(cf) {
  if (cf.freeEntry === true) return 0;
  const cover = String(cf.cover ?? '').trim();
  const match = cover.match(/(\d+)/);
  if (match) return parseInt(match[1], 10);
  return null;
}

// Henter beste tilgjengelige billett- / info-URL.
// Trimmer whitespace — noen ticketmaster-URLer i API-et har ledende mellomrom.
function hentLenke(råEvent, source) {
  const cf  = råEvent.custom_fields ?? {};
  const url = (cf.ticketUrl ?? '').trim() || (cf.moreInfo ?? '').trim();
  if (url) return url;
  // Fallback: venue-forsiden
  return source?.url ?? null;
}

// Henter bilde-URL (stor versjon for kortvisning)
function hentBilde(råEvent) {
  const stor = råEvent.photo?.urls?.large ?? råEvent.imagekit?.url ?? null;
  return stor ?? null;
}

// ─── Hoved-normaliseringsfunksjon ────────────────────────────────────────────

// Mapper ett rå broadcast.events-objekt til påby-eventformen.
// Alle felt som mangler eller er ugyldige settes til null.
export function normaliser(råEvent) {
  const source = råEvent._source ?? {};
  const cf     = råEvent.custom_fields ?? {};

  const tittel = råEvent.name?.trim() || null;
  const start  = tilNorskTid(råEvent.start_time);
  const slutt  = tilNorskTid(cf.end_time);
  const pris   = parsePris(cf);

  // API-et leverer place.name (f.eks. "Sentrum Scene") og koordinater per event.
  // Disse er mer presise enn source-konfigens fallback-verdier.
  const stedFraApi    = råEvent.place?.name?.trim()     || null;
  const adresseFraApi = råEvent.place
    ? [råEvent.place.address, råEvent.place.postal_code, råEvent.place.city]
        .filter(Boolean).join(', ')
    : null;

  const stedNavn = stedFraApi ?? source.sted ?? null;

  return {
    id:           lagId(tittel ?? 'ukjent', stedNavn ?? 'ukjent', start),
    tittel,
    kategori:     bestemKategori(råEvent, source.defaultKategori),
    sted:         stedNavn,
    adresse:      adresseFraApi ?? source.adresse ?? null,
    lat:          råEvent.place?.latitude  ?? source.lat ?? null,
    lng:          råEvent.place?.longitude ?? source.lng ?? null,
    start,
    slutt,
    pris,
    prisTekst:    pris === 0 ? 'Gratis' : pris ? `${pris} kr` : null,
    beskrivelse:  råEvent.details?.slice(0, 400).trim() || null,
    kuratortekst: null, // fylles inn manuelt i review-grensesnittet
    lenke:        hentLenke(råEvent, source),
    bilde:        hentBilde(råEvent),
    sistVerifisert: new Date().toISOString(),

    // Interne felt — fjernes før publisering til events.json
    _broadcastId: råEvent.id,   // original broadcast.events-id, for sporbarhet
  };
}

// Normaliserer en liste med rå-eventer og dropper dem som mangler tittel eller start.
export function normaliserAlle(råEventer) {
  return råEventer
    .map(normaliser)
    .filter((e) => e.tittel && e.start);
}
