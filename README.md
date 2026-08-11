# påby

Hyperlokalt oppdagelsesverktøy for Oslo — finn noe å gjøre i kveld.

Ren HTML/CSS/vanilla JS. Ingen byggsteg, ingen backend, ingen npm.

---

## Slik deployer og oppdaterer du

### Første gang: skru på GitHub Pages

Repoet er allerede pushet til GitHub. For å gjøre det tilgjengelig på nett:

1. Gå til `https://github.com/AxelWoxen/paaby/settings/pages`
2. Under **Branch**: velg `main` og `/` (root)
3. Klikk **Save**
4. Etter noen sekunder er siden live på `https://paaby.online` (egendomene satt opp via `CNAME`-filen i roten — uten den ville siden ligget på `https://axelwoxen.github.io/paaby/`)

`.nojekyll`-filen i roten sørger for at GitHub Pages serverer filene som de er, uten Jekyll-prosessering.

> **Merk:** `fetch('./data/events.json')` krever at appen serveres over HTTP(S) — ikke åpnet direkte som en fil. GitHub Pages ordner dette automatisk.

### Oppdatere arrangementer

1. Åpne `data/events.json`
2. Rediger arrayen (se feltbeskrivelser nedenfor)
3. Kjør lokalt for å sjekke: `python3 -m http.server 8000` → åpne `http://localhost:8000`
4. Commit og push:
   ```bash
   git add data/events.json
   git commit -m "Oppdater eventer"
   git push
   ```
   GitHub Pages publiserer endringen automatisk innen 1–2 minutter.

### Koble til analyse

1. Lim inn script-taggen fra din leverandør i `<head>` i `index.html`  
   (se kommentarblokken merket `ANALYSE-SCRIPT`)
2. Definer `window.__paaby_track` i det scriptet — se `js/application/sporing.js` for eksempler
3. Velg om samtykkestripa skal vises: den dukker opp automatisk for nye besøkende og forsvinner etter Ok

### Bytte datakilde (JSON → Supabase eller annet API)

Åpne `js/network/events-api.js` og bytt ut `fetch('./data/events.json')` med din forespørsel. Resten av appen trenger ingen endringer.

---

## SEO og ukesarkiv

Hver uke postes et håndplukket utvalg på Instagram/TikTok. `uke/`-mappen gjør samme
utvalg søkbart som en egen side — hver ukeside har sine egne meta-tagger, så den kan
rangere individuelt i Google i stedet for å konkurrere med forsiden. **Helt manuelt
foreløpig** — ingen bygg-steg, du oppretter én fil per uke selv. Tar ~2 minutter:

1. **Kopiér forrige ukes fil** som utgangspunkt:
   ```bash
   cp uke/2026-08-03.html uke/2026-08-10.html
   ```
   (bruk mandagsdatoen for uka som filnavn, `YYYY-MM-DD.html`)

2. **Rediger `uke/2026-08-10.html`:**
   - `<title>`, `<meta name="description">`, `og:title`, `og:description`,
     `twitter:title`, `twitter:description` — nytt ukenummer og en kort,
     treffende oppsummering (samme stil som slide-teksten på Instagram)
   - `og:url` og `<link rel="canonical">` — oppdater datoen i URL-en
   - `<h1 class="uke-tittel">` og introteksten under
   - Bytt ut `.uke-event`-blokkene med denne ukas utvalg — samme innhold
     som slidesene (tittel, sted, dato, pris, kuratortekst), bare i tekstform

3. **Legg til i arkivlista** — ny `<a class="uke-arkiv-lenke">` øverst
   (nyeste først) i `uke/index.html`, pekende på den nye filen.

4. **Legg til i `sitemap.xml`** — ny `<url>`-blokk for den nye ukesiden, og
   oppdater `<lastmod>` på `/` og `/uke/` til dagens dato.

5. **Test lokalt** (`python3 -m http.server 8000` → `http://localhost:8000/uke/2026-08-10.html`),
   commit og push som vanlig.

Trenger du å endre selve *utseendet* på ukesidene (ikke innholdet), er stilarket
`css/uke.css` — det gjenbruker fargevariablene fra `css/variabler.css`/`css/stil.css`
så det matcher resten av appen automatisk.

---

## Feltbeskrivelse for events.json

```json
{
  "id":            "sted-slug-YYYY-MM-DD",
  "tittel":        "Navn på arrangementet",
  "kategori":      "musikk",
  "sted":          "Venuenavn",
  "adresse":       "Gateadresse, postnummer Oslo",
  "lat":           59.9228,
  "lng":           10.7503,
  "start":         "2026-07-18T20:00:00+02:00",
  "slutt":         "2026-07-18T23:30:00+02:00",
  "pris":          150,
  "prisTekst":     "150 kr",
  "beskrivelse":   "En setning eller to.",
  "kuratortekst":  "Kort redaksjonell begrunnelse.",
  "lenke":         "https://...",
  "bilde":         null,
  "sistVerifisert": "2026-07-15T04:00:00+02:00"
}
```

| Felt | Krav | Merknad |
|------|------|---------|
| `id` | påkrevd | unik, stabil streng |
| `tittel` | påkrevd | |
| `kategori` | påkrevd | `musikk` / `klubb` / `pafunn` |
| `sted` | påkrevd | |
| `start` | påkrevd | ISO 8601 med tidssone (`+02:00` sommer) |
| `pris` | påkrevd | tall i kr · `0` = gratis · `null` = ukjent |
| `slutt` | valgfri | `null` = start + 4 timer |
| `lat` / `lng` | valgfri | begge satt eller begge `null` |
| `bilde` | valgfri | `null` = bruk kategoribilde automatisk |
| `prisTekst` | valgfri | vises til bruker i stedet for beregnet tekst |

---

## Vedlikehold

### Rydde bort gamle eventer

`data/events.json` vokser seg full av passerte engangsarrangementer over tid.
`scripts/rydd-gamle-eventer.js` fjerner eventer der effektiv sluttid (`slutt`,
eller `start` + 4 timer dersom `slutt` mangler) er mer enn 5 dager tilbake i
tid. Eventer med `gjentas` satt røres aldri — de er ankerdatoer
`utvidGjentakende()` (`js/application/gjentas.js`) bruker til å generere
fremtidige forekomster, uansett hvor gammel `start` er.

Kjøres manuelt ved behov — **ikke** automatisk ved commit/deploy:

```bash
node scripts/rydd-gamle-eventer.js
```

Skriptet skriver ryddet liste tilbake til `data/events.json` og lister ut i
konsollen hvor mange (og hvilke id-er) som ble fjernet, slik at du kan sjekke
`git diff` før du committer.
