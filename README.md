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
4. Etter noen sekunder er siden live på `https://axelwoxen.github.io/paaby/`

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
| `kategori` | påkrevd | `musikk` / `mat` / `klubb` / `pafunn` |
| `sted` | påkrevd | |
| `start` | påkrevd | ISO 8601 med tidssone (`+02:00` sommer) |
| `pris` | påkrevd | tall i kr · `0` = gratis · `null` = ukjent |
| `slutt` | valgfri | `null` = start + 4 timer |
| `lat` / `lng` | valgfri | begge satt eller begge `null` |
| `bilde` | valgfri | `null` = bruk kategoribilde automatisk |
| `prisTekst` | valgfri | vises til bruker i stedet for beregnet tekst |
