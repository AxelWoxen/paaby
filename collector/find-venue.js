// Hjelpeverktøy: finn venueId for et broadcast.events-domene.
// Bruk: node find-venue.js https://www.eksempel.no
//
// Henter forsiden, leser __NEXT_DATA__ og skriver ut venueId + konfigblokk
// du kan lime rett inn i config/sources.js.

const url = process.argv[2];
if (!url) {
  console.error('Bruk: node find-venue.js <url>');
  console.error('Eksempel: node find-venue.js https://www.rockefeller.no');
  process.exit(1);
}

const UA = 'paaby-collector/0.1 (læringsprosjekt, kontakt: axwoxen@gmail.com)';

const res  = await fetch(url, { headers: { 'User-Agent': UA } });
const html = await res.text();

const match = html.match(/id="__NEXT_DATA__"[^>]*>(.+?)<\/script>/s);
if (!match) {
  console.error('Fant ikke __NEXT_DATA__ — siden er sannsynligvis ikke et broadcast.events-venue.');
  process.exit(1);
}

const data    = JSON.parse(match[1]);
const vd      = data?.props?.pageProps?.venueData;

if (!vd) {
  console.error('Fant __NEXT_DATA__ men ingen venueData �� ikke et broadcast.events-venue.');
  process.exit(1);
}

const slug = new URL(url).hostname.replace(/^www\./, '').replace(/\.[^.]+$/, '').replace(/\./g, '-');

// Noen venues lagrer navn/adresse i venueData, andre ikke.
// Hent fra place-data i eventsEdge-svaret som backup.
let sted    = vd.name    ?? null;
let adresse = vd.address ? `${vd.address}, ${vd.postal_code ?? ''} ${vd.city ?? ''}`.trim() : null;
let lat     = null;
let lng     = null;

if (!sted || !adresse) {
  console.log('Henter venue-info fra eventsEdge...');
  const eRes = await fetch(
    `${new URL(url).origin}/api/eventsEdge?venueId=${vd.objectId}&limit=1`,
    { headers: { 'User-Agent': UA } }
  );
  const events = await eRes.json();
  const place  = events?.[0]?.place;
  if (place) {
    sted    = sted    ?? place.name;
    adresse = adresse ?? [place.address, place.postal_code, place.city].filter(Boolean).join(', ');
    lat     = place.latitude  ?? null;
    lng     = place.longitude ?? null;
  }
}

console.log(`\n✓ Broadcast.events-venue funnet\n`);
console.log(`  venueId : ${vd.objectId}`);
console.log(`  navn    : ${sted}`);
console.log(`  adresse : ${adresse}`);
if (lat) console.log(`  lat/lng : ${lat}, ${lng}`);
console.log(`\nLim inn i config/sources.js:\n`);
console.log(`  {
    id:              '${slug}',
    adapter:         'broadcast-events',
    url:             '${new URL(url).origin}',
    venueId:         '${vd.objectId}',
    defaultKategori: 'musikk',
    sted:            '${sted}',
    adresse:         '${adresse}',
    lat:             ${lat ?? 'null'},
    lng:             ${lng ?? 'null'},
  },`);
