// auth.test.mjs — bekrefter at innlogging faktisk håndheves server-side.
//
// Kjøres mot en ekte, kjørende instans av review/server.js (mot lokal
// paaby_dev — ALDRI mot produksjon). Starter og stopper serveren selv på en
// egen testport, slik at testen kan kjøres uavhengig av om noen har
// `npm run review` oppe fra før.
//
// Kjør: cd collector && node --test review/tests/auth.test.mjs

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3911; // dedikert testport — kolliderer ikke med npm run review (3001)
const BASE = `http://localhost:${PORT}`;

let serverProsess;

before(async () => {
  serverProsess = spawn('node', [path.join(__dirname, '../server.js')], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'pipe',
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server startet ikke i tide')), 8000);
    serverProsess.stdout.on('data', (data) => {
      if (data.toString().includes('kjører på')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    serverProsess.stderr.on('data', (data) => process.stderr.write(data));
  });
});

after(() => {
  serverProsess?.kill();
});

// Alle disse skal kreve innlogging — enten redirect (sider/statiske filer)
// eller 401 JSON (/api/*). Ingen av dem skal noensinne returnere 200 uten
// en gyldig session.
const BESKYTTEDE_GET_RUTER = [
  '/',
  '/index.html',
  '/js/main.js',
  '/js/api.js',
  '/api/candidates',
  '/api/publiserte',
  '/api/miljo',
  '/api/meg',
];

for (const rute of BESKYTTEDE_GET_RUTER) {
  test(`GET ${rute} uten sesjon krever innlogging`, async () => {
    const res = await fetch(`${BASE}${rute}`, { redirect: 'manual' });
    if (rute.startsWith('/api/')) {
      assert.equal(res.status, 401, `${rute} skal svare 401, fikk ${res.status}`);
    } else {
      assert.equal(res.status, 302, `${rute} skal redirecte (302), fikk ${res.status}`);
      assert.match(res.headers.get('location') ?? '', /\/login$/);
    }
  });
}

const BESKYTTEDE_POST_RUTER = [
  '/api/manuell',
  '/api/avslaa/x',
  '/api/godkjenn/x',
  '/api/fremhev/x',
  '/api/deaktiver/x',
  '/api/oppdater/x',
  '/api/gjentas/x',
  '/api/kandidat/x/oppdater',
];

for (const rute of BESKYTTEDE_POST_RUTER) {
  test(`POST ${rute} uten sesjon krever innlogging (401, ikke utfør handlingen)`, async () => {
    const res = await fetch(`${BASE}${rute}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Paaby-Admin': '1' },
      body: '{}',
    });
    assert.equal(res.status, 401, `${rute} skal svare 401, fikk ${res.status}`);
  });
}

// Den smale unntakslisten: login.html sine egne ressurser skal være
// tilgjengelige UTEN sesjon (GET), men ingenting annet i /fonts/ eller
// andre .css-filer skal slippe gjennom via samme mekanisme.
test('GET /admin.css uten sesjon er tillatt (login.html trenger den)', async () => {
  const res = await fetch(`${BASE}/admin.css`);
  assert.equal(res.status, 200);
});

test('GET /fonts/SpartanMB-Regular.otf uten sesjon er tillatt', async () => {
  const res = await fetch(`${BASE}/fonts/SpartanMB-Regular.otf`);
  assert.equal(res.status, 200);
});

test('GET /login.js uten sesjon er tillatt (login.html sin feilmelding-logikk)', async () => {
  const res = await fetch(`${BASE}/login.js`);
  assert.equal(res.status, 200);
});

test('POST til /admin.css uten sesjon er IKKE tillatt (allowlisten er kun GET)', async () => {
  const res = await fetch(`${BASE}/admin.css`, { method: 'POST', redirect: 'manual' });
  assert.equal(res.status, 302);
  assert.match(res.headers.get('location') ?? '', /\/login$/);
});

test('GET på en vilkårlig annen fontfil/sti er IKKE tillatt (ingen prefiks-/wildcard-unntak)', async () => {
  const res = await fetch(`${BASE}/fonts/noe-annet.otf`, { redirect: 'manual' });
  assert.equal(res.status, 302);
});

test('/login (GET) og /logout (POST) er fortsatt åpne', async () => {
  const loginRes = await fetch(`${BASE}/login`);
  assert.equal(loginRes.status, 200);

  const logoutRes = await fetch(`${BASE}/logout`, { method: 'POST', redirect: 'manual' });
  assert.equal(logoutRes.status, 302);
});
