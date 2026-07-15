/*
 * ================================================================
 * events.js — demoarrangementer for påby
 * ================================================================
 *
 * Slik legger du til et arrangement:
 *   1. Kopier MAL-objektet nedenfor
 *   2. Fyll inn feltene
 *   3. Legg objektet til i EVENTER-arrayen
 *   4. Lagre og last appen på nytt — ferdig
 *
 * ----------------------------------------------------------------
 * MAL:
 *
 * {
 *   id:            'sted-slug-YYYY-MM-DD-HHMM',     // PÅKREVD — unik, stabil
 *   tittel:        'Navn på arrangementet',           // PÅKREVD
 *   kategori:      'musikk',                          // PÅKREVD — 'musikk' | 'mat' | 'klubb'
 *   sted:          'Venuenavn',                       // PÅKREVD
 *   adresse:       'Gateadresse, Oslo',               // valgfri
 *   lat:           59.9133,                           // valgfri
 *   lng:           10.7388,                           // valgfri
 *   start:         '2026-07-18T20:00:00+02:00',      // PÅKREVD — ISO 8601 med Oslo-offset
 *   slutt:         '2026-07-18T23:30:00+02:00',      // valgfri — mangler = start + 4 timer
 *   pris:          0,                                 // PÅKREVD — tall i kr, 0 = gratis, null = ukjent
 *   prisTekst:     'Gratis',                          // valgfri — vises til bruker
 *   beskrivelse:   'En setning eller to.',            // valgfri
 *   kuratortekst:  'Kort redaksjonell begrunnelse.',  // valgfri
 *   lenke:         'https://...',                     // valgfri — billett / mer info
 *   bilde:         'https://...',                     // valgfri — URL eller lokal sti
 *   sistVerifisert: '2026-07-15T18:00:00+02:00',     // valgfri — tillitssignal
 * }
 *
 * Tips:
 *   - Oslo sommertid: +02:00 (mars–oktober)
 *   - Oslo vintertid: +01:00 (oktober–mars)
 *   - Filtrering bruker pris (tall), ikke prisTekst
 *   - Passerte arrangementer skjules automatisk (se slutt-feltet)
 * ================================================================
 */

export const EVENTER = [
  {
    id:            'blaa-jazzkvelder-2026-07-16-2000',
    tittel:        'Blå Jazzkvelder',
    kategori:      'musikk',
    sted:          'Blå',
    adresse:       'Brenneriveien 9C, Oslo',
    lat:           59.9228,
    lng:           10.7503,
    start:         '2026-07-16T20:00:00+02:00',
    slutt:         '2026-07-16T23:30:00+02:00',
    pris:          0,
    prisTekst:     'Gratis',
    beskrivelse:   'Åpen scene med ukens beste jazz-talenter. Intim stemning, billig øl, og ingen som later som om de forstår musikken bedre enn deg.',
    kuratortekst:  'Lav terskel, god musikk og ingen pretensiøs stemning.',
    lenke:         'https://blaaoslo.no',
    bilde:         'https://images.unsplash.com/photo-1511192336575-5a79af67a629?w=800&q=80',
    sistVerifisert: '2026-07-15T18:00:00+02:00',
  },
  {
    id:            'vippa-streetfood-2026-07-17-1200',
    tittel:        'Vippa Streetfood',
    kategori:      'mat',
    sted:          'Vippa',
    adresse:       'Akershusstranda 25, Oslo',
    lat:           59.9066,
    lng:           10.7461,
    start:         '2026-07-17T12:00:00+02:00',
    slutt:         '2026-07-17T21:00:00+02:00',
    pris:          0,
    prisTekst:     'Gratis inn',
    beskrivelse:   'Streetfood fra alle verdenshjørner i en gammel fergekai ved fjorden. Ta med venner, spis for mye, angre ingenting.',
    kuratortekst:  'Perfekt fredag-spot — gratis inngang, mange valgmuligheter.',
    lenke:         'https://vippa.no',
    bilde:         'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&q=80',
    sistVerifisert: '2026-07-15T18:00:00+02:00',
  },
  {
    id:            'palace-grill-popup-2026-07-17-1800',
    tittel:        'Palace Grill Pop-up',
    kategori:      'mat',
    sted:          'Palace Grill',
    adresse:       'Solligata 2, Oslo',
    lat:           59.9133,
    lng:           10.7285,
    start:         '2026-07-17T18:00:00+02:00',
    slutt:         '2026-07-17T22:00:00+02:00',
    pris:          0,
    prisTekst:     'Gratis',
    beskrivelse:   'Oslos minste restaurant tar utekjøkkenet ut i solen. Ingen booking, førstemann til mølla, og køen er verdt det.',
    lenke:         'https://palacegrill.no',
    bilde:         'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80',
    sistVerifisert: '2026-07-15T18:00:00+02:00',
  },
  {
    id:            'john-olav-nilsen-2026-07-18-2000',
    tittel:        'John Olav Nilsen & Gjengen',
    kategori:      'musikk',
    sted:          'Rockefeller',
    adresse:       'Torggata 16, Oslo',
    lat:           59.9167,
    lng:           10.7508,
    start:         '2026-07-18T20:00:00+02:00',
    slutt:         '2026-07-18T23:00:00+02:00',
    pris:          350,
    prisTekst:     '350 kr',
    beskrivelse:   'Norsk rock som faktisk betyr noe. Mosh pit, lettøl og folk som kan hvert eneste vers. En av Oslos beste livescener.',
    lenke:         'https://rockefeller.no',
    bilde:         'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800&q=80',
    sistVerifisert: '2026-07-15T18:00:00+02:00',
  },
  {
    id:            'smakfest-oslo-2026-07-18-1100',
    tittel:        'Smakfest Oslo',
    kategori:      'mat',
    sted:          'Youngstorget',
    adresse:       'Youngstorget, Oslo',
    lat:           59.9133,
    lng:           10.7499,
    start:         '2026-07-18T11:00:00+02:00',
    slutt:         '2026-07-18T20:00:00+02:00',
    pris:          0,
    prisTekst:     'Gratis inn',
    beskrivelse:   '40+ matboder midt i sentrum. Norske råvarer, globale smaker og nok samplings til at du kan kalle det lunsj med god samvittighet.',
    kuratortekst:  'Spent lørdag-aktivitet for hele dagen.',
    lenke:         'https://smakfest.no',
    bilde:         'https://images.unsplash.com/photo-1488459716781-31db52582fe9?w=800&q=80',
    sistVerifisert: '2026-07-15T18:00:00+02:00',
  },
  {
    id:            'nattskift-jaeger-2026-07-18-2300',
    tittel:        'Nattskift',
    kategori:      'klubb',
    sted:          'Jaeger',
    adresse:       'Grensen 9, Oslo',
    lat:           59.9133,
    lng:           10.7388,
    start:         '2026-07-18T23:00:00+02:00',
    slutt:         '2026-07-19T06:00:00+02:00',
    pris:          200,
    prisTekst:     '200 kr',
    beskrivelse:   'Jaeger gjør det de er best på: fire etasjer med hard techno og folk som fortsatt danser når renholdet kommer. Kom seint.',
    lenke:         'https://jaeger.no',
    bilde:         'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&q=80',
    sistVerifisert: '2026-07-15T18:00:00+02:00',
  },
  {
    id:            'haerverk-warehouse-2026-07-19-2200',
    tittel:        'Hærverk Warehouse',
    kategori:      'klubb',
    sted:          'Hærverk',
    adresse:       'Maridalsveien 17, Oslo',
    lat:           59.9094,
    lng:           10.7537,
    start:         '2026-07-19T22:00:00+02:00',
    slutt:         '2026-07-20T05:00:00+02:00',
    pris:          150,
    prisTekst:     '150 kr',
    beskrivelse:   'Underground techno i et gammelt lagerbygg. Lydanlegget er latterlig bra og dørpolitikken er menneskelig. Kom i god tid.',
    lenke:         'https://haerverk.no',
    bilde:         'https://images.unsplash.com/photo-1571266028243-d220c6a3baa8?w=800&q=80',
    sistVerifisert: '2026-07-15T18:00:00+02:00',
  },
  {
    id:            'tim-wendelboe-kaffemote-2026-07-20-1000',
    tittel:        'Tim Wendelboe Kaffemøte',
    kategori:      'mat',
    sted:          'Tim Wendelboe',
    adresse:       'Grüners gate 1, Oslo',
    lat:           59.9261,
    lng:           10.7428,
    start:         '2026-07-20T10:00:00+02:00',
    slutt:         '2026-07-20T12:00:00+02:00',
    pris:          100,
    prisTekst:     '100 kr',
    beskrivelse:   'Verdens beste kaffebar arrangerer smaksøkt med tre single-origin espressoer. Du vet ikke du er snobb før du har vært her.',
    kuratortekst:  'For den nysgjerrige — ikke nødvendig å kunne noe om kaffe på forhånd.',
    lenke:         'https://timwendelboe.no',
    bilde:         'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800&q=80',
    sistVerifisert: '2026-07-15T18:00:00+02:00',
  },
];
