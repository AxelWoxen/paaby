/* mock-api.mjs — lokal falsk API-server for å se feeden uten database.
   Kjør: node dev/mock-api.mjs   (lytter på http://localhost:3000)
   Svarer kun på GET /api/events; alt annet gir tom 200-respons. */

import http from 'node:http';

const PORT = 3000;

const MALER = [
  ['Kanskje standup: Et glass for 2', 'pafunn', 'Harlem Oslo', 150],
  ['Jazz i hagen', 'musikk', 'Cafe Sør', 0],
  ['Klubbnatt med DJ Frost', 'klubb', 'Blå', 250],
  ['Vinylkveld', 'musikk', 'Revolver', 120],
  ['Loppemarked på Grønland', 'pafunn', 'Grønland torg', 0],
  ['Techno til soloppgang', 'klubb', 'Jæger', 300],
  ['Akustisk kveld', 'musikk', 'Parkteatret', 180],
  ['Quiz og taco', 'pafunn', 'Sentrum Scene', 90],
  ['Indie-konsert: Nordlys', 'musikk', 'Rockefeller', 350],
  ['Retro disco', 'klubb', 'Villa', 200],
  ['Keramikkverksted', 'pafunn', 'Tøyen kulturhus', 450],
  ['Husmusikk-natt', 'klubb', 'Sentrum Scene', 220],
  ['Soul på Kampen', 'musikk', 'Kampen bistro', 140],
  ['Filmkveld utendørs', 'pafunn', 'Sofienbergparken', 0],
  ['Rock for alle', 'musikk', 'Revolver', 160],
  ['Latin night', 'klubb', 'Bar Boca', 100],
];

function byggEventer() {
  const na = new Date();
  return MALER.map(([tittel, kategori, sted, pris], i) => {
    const start = new Date(na);
    start.setDate(na.getDate() + Math.floor(i / 2));
    start.setHours(18 + (i % 4), 0, 0, 0);
    return {
      id: `mock-${i}`,
      tittel,
      kategori,
      sted,
      start: start.toISOString(),
      slutt: null,
      pris,
      prisTekst: null,
      bilde: null,
      lenke: 'https://paaby.no',
      beskrivelse: 'Falskt arrangement for lokal testing.',
      lat: 59.91 + (i % 5) * 0.004,
      lng: 10.75 + (i % 4) * 0.005,
    };
  });
}

http
  .createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.writeHead(204).end();

    res.setHeader('Content-Type', 'application/json');
    if (req.url.startsWith('/api/events')) {
      return res.end(JSON.stringify({ events: byggEventer() }));
    }
    res.end('{}');
  })
  .listen(PORT, () => console.log(`Mock-API på http://localhost:${PORT}`));
