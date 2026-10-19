// ─── Slik legger du til en ny kilde ──────────────────────────────────────────
//
// Broadcast.events-venues: finn venueId ved å kjøre:
//   node find-venue.js https://www.eksempel.no
//
// Det henter __NEXT_DATA__ fra forsiden og skriver ut venueId + navn.
// Eksempel på venues som bruker broadcast.events (sjekket 2026-07-20):
//   BLÅ              → blaaoslo.no        → EjDaWBZGvl
//   Rockefeller      → rockefeller.no     → DOtnIChxc7  (kalt "Sentrum Scene" i API-et)
//   Jaeger           → ikke broadcast
//   Kulturhuset      → ikke broadcast
//
// Felt (broadcast-events):
//   id              — vises i logger, brukes i cache-filnavn. Bruk slug-format.
//   adapter         — hvilken adapter-fil: 'broadcast-events' | 'ticketmaster' | 'tikkio'
//   url             — domenet til venue-siten (ikke API-URL)
//   venueId         — objectId fra __NEXT_DATA__.props.pageProps.venueData.objectId
//   defaultKategori — brukes når type-feltet i API-et ikke gir nok info
//   sted/adresse/lat/lng — fallback-verdier; adapteren bruker API-dataene hvis de finnes
//
// Felt som gjelder generelt, på tvers av adaptere:
//   tokenEnv — navnet på en env-variabel kilden krever (f.eks.
//              'TICKETMASTER_API_KEY'). Hvis satt og variabelen mangler,
//              hopper run.js over kilden med en tydelig melding — den kaller
//              aldri selve adapteren. Secrets kommer ALLTID fra env, aldri
//              fra denne filen.
//
export const SOURCES = [
  {
    id:              'tikkio-oslo',
    adapter:         'tikkio',
    // Ingen API-nøkkel kreves — bekreftet manuelt (HTTP 200, ekte
    // Oslo-events) før adapteren ble skrevet. Ingen tokenEnv derfor.
    country:          'NO',
    // municipality_code alene (0301 = Oslo kommune) gir allerede kun Oslo —
    // testet uten å i tillegg sende city, som ville vært redundant/fritekst.
    municipalityCode: '0301',
    lang:             'no',
    defaultKategori:  'pafunn',
  },
  {
    id:              'ticketmaster-no',
    adapter:         'ticketmaster',
    tokenEnv:        'TICKETMASTER_API_KEY',
    // geoPoint+radius (ikke city=Oslo) — Discovery API sin egen,
    // strukturerte geo-filtrering (se adapters/ticketmaster.js). Byttet fra
    // city=Oslo etter en coverage-analyse (2026-10-18) som viste at
    // Unity Arena (Oslo-regionens største nye arena, 7 events i 30-dagers
    // vinduet, bl.a. Stevie Wonder/J. Cole/The Prodigy) er tagget
    // venue.city="Fornebu" i Discovery API-et og dermed usynlig for
    // city=Oslo — selv om ticketmaster.no sin egen Oslo-side eksplisitt
    // lister Unity Arena som et Oslo-spillested. geoPoint=25km rundt Oslo
    // sentrum fanger opp dette uten å dra inn Bergen/Kristiansand/Tønsberg/
    // Fredrikstad/Lena (verifisert: 0 tap av city=Oslo sine 38 treff, +7
    // nye, 0 falske positive fra andre byer ved 25km).
    // countryCode beholdt som ekstra sikkerhet nær landegrensen, kostet
    // ingenting i testen (identisk resultat med/uten).
    countryCode:     'NO',
    geoPoint:        'u4xsudv', // Oslo sentrum (59.9139, 10.7522), 7-tegns geohash
    radius:          25,
    unit:            'km',
    defaultKategori: 'musikk',
  },
  {
    id:              'blaa',
    adapter:         'broadcast-events',
    url:             'https://www.blaaoslo.no',
    venueId:         'EjDaWBZGvl',
    defaultKategori: 'musikk',
    // Fallback-verdier (API-et returnerer koordinater per event)
    sted:    'BLÅ',
    adresse: 'Brenneriveien 9c, 0182 Oslo',
    lat:     59.92035,
    lng:     10.75279,
  },
  {
    id:              'rockefeller',
    adapter:         'broadcast-events',
    url:             'https://www.rockefeller.no',
    venueId:         'DOtnIChxc7',
    defaultKategori: 'musikk',
    // API-et kaller dette "Sentrum Scene" — normalize.js bruker place.name fra svaret
    sted:    'Rockefeller / Sentrum Scene',
    adresse: 'Arbeidersamfunnets plass 1, 0181 Oslo',
    lat:     59.91552,
    lng:     10.7518,
  },
  {
    id:              'billetto-oslo',
    adapter:         'billetto',
    tokenEnv:        'BILLETTO_API_KEY', // adapteren sjekker selv at BILLETTO_API_SECRET også finnes
    // subregion=Oslo — valgt etter live coverage-test (2026-10-20) av alle
    // fire dokumenterte geofelt (postal_code/macroregion/region/subregion),
    // se adapters/billetto.js. Viktig: API-et er domene-skopet (billetto.no
    // = Norge), ikke land-skopet via parameter — ingen country_code finnes.
    subregion:       'Oslo',
    defaultKategori: 'pafunn',
  },
];
