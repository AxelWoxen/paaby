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
// Felt:
//   id              — vises i logger, brukes i cache-filnavn. Bruk slug-format.
//   adapter         — hvilken adapter-fil: 'broadcast-events' (mer kommer)
//   url             — domenet til venue-siten (ikke API-URL)
//   venueId         — objectId fra __NEXT_DATA__.props.pageProps.venueData.objectId
//   defaultKategori — brukes når type-feltet i API-et ikke gir nok info
//   sted/adresse/lat/lng — fallback-verdier; normalize.js bruker API-dataene hvis de finnes

export const SOURCES = [
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
];
