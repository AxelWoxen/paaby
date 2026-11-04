// Tar et skjermbilde av en side med headless Chrome og lagrer det som PNG.
// Ingen avhengigheter: snakker med Chrome over DevTools-protokollen.
//
// Bruk:
//   node --experimental-websocket .claude/skills/pr-skjermbilder/skjermbilde.mjs \
//     --url http://localhost:3456 --ut .pr-bilder/min-branch/01-forside-etter-laptop.png \
//     [--mobil] [--fullside] [--js "document.querySelector('#knapp').click()"] [--vent 800]
//
// --mobil     375x812 med mobil-emulering (ellers 1440x900)
// --fullside  hele siden, ikke bare det som er synlig
// --js        kode som kjøres etter lasting (f.eks. åpne en modal); kan bruke await
// --vent      ms å vente etter lasting og etter --js (standard 800)

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const args = process.argv.slice(2);
const flagg = (navn) => args.includes(navn);
const verdi = (navn, standard) => {
  const i = args.indexOf(navn);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : standard;
};

const url = verdi('--url');
const ut = verdi('--ut');
const mobil = flagg('--mobil');
const fullside = flagg('--fullside');
const js = verdi('--js');
const vent = Number(verdi('--vent', 800));

if (!url || !ut) {
  console.error('Mangler --url eller --ut. Se toppen av filen for bruk.');
  process.exit(1);
}
if (typeof WebSocket === 'undefined') {
  console.error('Kjør med: node --experimental-websocket ... (Node 20) eller Node 22+.');
  process.exit(1);
}

const chromeKandidater = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);
const chrome = chromeKandidater.find((p) => existsSync(p));
if (!chrome) {
  console.error('Fant ikke Chrome. Sett CHROME_PATH.');
  process.exit(1);
}

const profil = mkdtempSync(join(tmpdir(), 'pr-skjermbilde-'));
const prosess = spawn(chrome, [
  '--headless=new',
  '--remote-debugging-port=0',
  `--user-data-dir=${profil}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--hide-scrollbars',
  'about:blank',
]);

const sov = (ms) => new Promise((r) => setTimeout(r, ms));

function rydd() {
  prosess.kill();
  try { rmSync(profil, { recursive: true, force: true }); } catch {}
}

const wsUrl = await new Promise((ok, feil) => {
  let buffer = '';
  const t = setTimeout(() => feil(new Error('Chrome startet ikke innen 15 s')), 15000);
  prosess.stderr.on('data', (d) => {
    buffer += d;
    const m = buffer.match(/DevTools listening on (ws:\/\/\S+)/);
    if (m) { clearTimeout(t); ok(m[1]); }
  });
  prosess.on('exit', () => feil(new Error('Chrome avsluttet')));
});

const ws = new WebSocket(wsUrl);
await new Promise((ok) => ws.addEventListener('open', ok, { once: true }));

let nesteId = 1;
const ventende = new Map();
const lyttere = [];
ws.addEventListener('message', (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && ventende.has(msg.id)) {
    const { ok, feil } = ventende.get(msg.id);
    ventende.delete(msg.id);
    msg.error ? feil(new Error(msg.error.message)) : ok(msg.result);
  } else if (msg.method) {
    lyttere.forEach((l) => l(msg));
  }
});
const send = (method, params = {}, sessionId) =>
  new Promise((ok, feil) => {
    const id = nesteId++;
    ventende.set(id, { ok, feil });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
const ventPå = (method, sessionId, ms = 20000) =>
  new Promise((ok) => {
    const t = setTimeout(ok, ms);
    lyttere.push((m) => {
      if (m.method === method && m.sessionId === sessionId) { clearTimeout(t); ok(); }
    });
  });

try {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const s = (m, p) => send(m, p, sessionId);

  const [bredde, høyde] = mobil ? [375, 812] : [1440, 900];
  await s('Page.enable');
  await s('Emulation.setDeviceMetricsOverride', {
    width: bredde, height: høyde, deviceScaleFactor: 2, mobile: mobil,
  });
  if (mobil) {
    await s('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await s('Emulation.setUserAgentOverride', {
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
    });
  }

  const lastet = ventPå('Page.loadEventFired', sessionId);
  const nav = await s('Page.navigate', { url });
  if (nav.errorText) throw new Error(`Kunne ikke laste ${url}: ${nav.errorText}`);
  await lastet;
  await sov(vent);

  if (js) {
    const r = await s('Runtime.evaluate', {
      expression: `(async () => { ${js} })()`,
      awaitPromise: true,
      userGesture: true,
    });
    if (r.exceptionDetails) throw new Error(`--js feilet: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    await sov(vent);
  }

  const params = { format: 'png' };
  if (fullside) {
    const { cssContentSize } = await s('Page.getLayoutMetrics');
    params.captureBeyondViewport = true;
    params.clip = { x: 0, y: 0, width: bredde, height: Math.ceil(cssContentSize.height), scale: 1 };
  }
  const { data } = await s('Page.captureScreenshot', params);
  const fil = resolve(ut);
  mkdirSync(dirname(fil), { recursive: true });
  writeFileSync(fil, Buffer.from(data, 'base64'));
  console.log(`Lagret ${fil}`);
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  ws.close();
  rydd();
}
