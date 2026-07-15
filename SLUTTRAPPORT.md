# påby — sluttrapport

Pre-launch cleanup gjennomført. Her er en fullstendig oversikt over hva som ble endret, hva som ble testet, og hva du må gjøre før produksjonssetting.

---

## Endrede filer

### Nye filer
| Fil | Hva |
|-----|-----|
| `js/application/oslo-tid.js` | DST-sikker Oslo-tid via `Intl.DateTimeFormat` |
| `js/application/validering.js` | Filtrerer ugyldige events ved oppstart, URL-validering |
| `bilder/favicon.svg` | SVG-favicon: mørk bakgrunn + korall-pin |
| `bilder/og-bilde.svg` | OG-bilde 1200×630 (se: Produksjonsoppgaver) |
| `tester.html` | Nettleser-basert testrunner (~50 tester) |
| `.gitignore` | Utelukker node_modules, .DS_Store, server.js, package.json |

### Oppdaterte filer
| Fil | Hva ble endret |
|-----|----------------|
| `data/events.js` | Eksplisitte IDer, ISO 8601+tidssone, nye felt (slutt, prisTekst, kuratortekst, sistVerifisert) |
| `js/network/events-api.js` | Bruker nå validering.js, fjernet dynamisk ID-generering |
| `js/application/formatering.js` | Alt bruker `osloKomponenter()`. Nye: `formaterVerifisert`, `lagDagLabel`, `formaterPrisTekst` |
| `js/application/gruppering.js` | `skjulPasserte` bruker slutt+4h fallback, aksepterer `nå`-param for testing |
| `js/application/filtre.js` | `tid`/`pris` er nå `string\|null` (ikke array). `erIHelga` ny logikk (fre 16–søn 23:59). `under-200` inkluderer gratis |
| `js/application/lagret.js` | Alt i try/catch, `hentLagredeIder(gyldigeIder?)`, ny nøkkel `paaby-lagret` |
| `js/presentation/kart.js` | Tømt til tomme stubs (Leaflet fjernet) |
| `js/presentation/feed.js` | XSS-sikker (DOM-konstruksjon), bilde-fallback med `{ once: true }`, dispatches custom event |
| `js/presentation/modal.js` | XSS-sikker, fokus-felle, fokus-retur, hash-routing, kuratortekst + sistVerifisert, del-knapp |
| `js/main.js` | Fjernet geolocation-autokall og kart-import. Lagt til `initLagretSync`, `initHashRuting` |
| `index.html` | Favicon, OG-meta, `aria-pressed` på tid/pris-knapper, kart-seksjon fjernet |
| `css/variabler.css` | `--graa: #9994A2` (mer lesbar mot mørk bakgrunn) |
| `css/stil.css` | Nye stiler: `.modal-kuratortekst`, `.modal-tillit`, `.tillit-verifisert`, `.tillit-feedback`, `.kort-bilde-placeholder` |

### Slettede filer (fra Git)
- `server.js` — Express bare til statiske filer, ikke nødvendig
- `package.json` / `package-lock.json` — ingen runtime-avhengigheter
- `node_modules/` — ~600 filer fjernet fra Git-indeksen
- `data/events.json` — aldri brukt (data lå i events.js)

---

## Tester

### Kjørt via Node.js (logikktester)
```
38/38 tester bestod

1. Validering    — 9 tester
2. URL-validering — 5 tester
3. Passerte arr.  — 5 tester
4. Helgelogikk   — 9 tester
5. Prisfilter     — 5 tester
6. formaterVerifisert — 5 tester
```

### Kjøres i nettleser (`tester.html`)
Åpne `tester.html` via lokal webserver:
```bash
python3 -m http.server 8000
# Åpne http://localhost:8000/tester.html
```
Dekker i tillegg: localStorage-operasjoner, korrupt JSON, filterkombinasjoner.

### Syntakssjekk
Alle 11 JS-filer passerte `node --check`. Alle 19 import-stier er verifisert.

---

## Post-cleanup sjekkliste (seksjon 21)

| Sjekk | Status |
|-------|--------|
| `innerHTML` med brukerdata | Ingen — kun `container.innerHTML = ''` for å tømme beholdere |
| `geolocation` / `getCurrentPosition` | Ingen i bruk |
| `javascript:` URLer i kode | Ingen |
| `server.js` / Express-referanser | Fjernet fra Git |
| Leaflet / kart-referanser utenfor kart.js | Ingen |
| `data/events.json` referanser | Ingen |
| `node_modules` i Git | Fjernet |

---

## Produksjonsoppgaver (må gjøres av deg)

### 1. Fyll inn KONFIG i `js/presentation/modal.js`
```js
const KONFIG = {
  prodDomene:  'https://dittdomene.no',        // brukes av del-knapp
  feedbackUrl: 'https://forms.gle/dinlenke',   // "Noe feil?" i modal
};
```

### 2. OG-bilde til PNG
`bilder/og-bilde.svg` må konverteres til PNG for sosiale medier:
```bash
# Med Inkscape:
inkscape bilder/og-bilde.svg --export-png=bilder/og-bilde.png --export-width=1200

# Med rsvg-convert (Homebrew):
rsvg-convert -w 1200 bilder/og-bilde.svg > bilder/og-bilde.png
```

### 3. Oppdater OG-tagger i `index.html`
```html
<!-- Bytt ut disse to linjene med absolutte URLer: -->
<meta property="og:url"   content="https://dittdomene.no" />
<meta property="og:image" content="https://dittdomene.no/bilder/og-bilde.png" />
```

### 4. Legg til ekte bildeURLer i `data/events.js`
Feltene `bilde: null` bør fylles med reelle bildeURLer (HTTPS). Appen bruker kategori-farget placeholder om bildet mangler eller feiler.

### 5. Oppdater `sistVerifisert` jevnlig
Hvert event har `sistVerifisert: 'ISO-dato'`. Vises i modalen som "Sjekket i dag / i går / 10. jul". Oppdater dette hver gang du verifiserer at et event faktisk skjer.

---

## Arkitektur (kort)

```
index.html          → laster js/main.js som ES-modul
js/main.js          → orkestrerer alt, ingen global state utenfor
js/application/     → ren logikk, ingen DOM (testbar i Node.js)
  oslo-tid.js       → Intl.DateTimeFormat, DST-sikker
  validering.js     → filtrerer events ved oppstart
  formatering.js    → datoer, pris, verifisering
  gruppering.js     → dag-gruppering, skjulPasserte
  filtre.js         → filtrerEventer, erIHelga
  lagret.js         → localStorage med try/catch
js/presentation/    → DOM-manipulasjon
  feed.js           → kort-rendering, XSS-sikker
  modal.js          → modal, fokus-felle, hash-routing, XSS-sikker
  kart.js           → tomme stubs (Leaflet fjernet)
js/network/
  events-api.js     → henter og validerer events
data/events.js      → alle arrangementer
```

Ingen bundler. Ingen runtime-avhengigheter. Serve som statiske filer fra hvilken som helst webserver eller CDN.
