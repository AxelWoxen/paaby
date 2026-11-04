---
name: pr-skjermbilder
description: Bruk alltid når du lager eller endrer en funksjon i paaby og tester den i nettleseren. Lagre skjermbilder som filer underveis i testingen, så de kan brukes direkte i PR-en uten å ta dem på nytt. Er det en endring av noe som finnes fra før, ta både før- og etterbilder.
---

# Skjermbilder underveis, klare til PR

Skjermbilder fra den innebygde nettleseren (`computer` med `screenshot`) blir bare vist til deg, de lagres ikke som filer. Derfor må hvert bilde som er verdt å vise i PR-en også lagres på disk **i det øyeblikket du tester det**. Da trenger du ikke starte alt på nytt når PR-en lages (se `pr-krav`).

## Hvor bildene lagres

- Mappe: `.pr-bilder/<branch>/`, der `<branch>` er `git branch --show-current` med `/` byttet til `-` (f.eks. `.pr-bilder/feature-gratis-knapp/`). Mappen er i `.gitignore`.
- Filnavn: `<nr>-<hva>-<foer|etter|ny>-<laptop|mobil>.png`, f.eks. `01-filtermeny-foer-mobil.png`, `01-filtermeny-etter-mobil.png`, `02-kartvisning-ny-laptop.png`. Samme nummer og navn for et før/etter-par.
- `.pr-bilder/<branch>/bilder.md`: én linje per bilde med filnavn og bildetekst, f.eks. `01-filtermeny-etter-mobil.png: Filtermenyen viser nå «Gratis» øverst`. Skriv linjen samtidig som bildet lagres.

## Slik lagrer du et bilde

Bruk skriptet ved siden av denne filen. Det åpner samme URL i headless Chrome med samme visning og lagrer en PNG:

```bash
node --experimental-websocket .claude/skills/pr-skjermbilder/skjermbilde.mjs \
  --url http://localhost:3456 \
  --ut .pr-bilder/feature-gratis-knapp/01-filtermeny-etter-laptop.png
```

- `--mobil` gir 375x812 med mobil-emulering, ellers 1440x900. Ta laptop og mobil når endringen er visuell (se `visuell-testing`).
- `--js "..."` kjører kode etter lasting for å komme til riktig tilstand, f.eks. `--js "document.querySelector('.filter-knapp').click()"`. Bruk de samme klikkene som du gjorde i nettleserpanelet.
- `--fullside` tar hele siden. `--vent 1500` gir data mer tid til å laste.
- Bruk `http://localhost:...` fra dev-serveren, ikke `file://` (da lastes ikke data).
- Sider bak innlogging (f.eks. review-admin) har ikke innloggingen din i headless Chrome. Logg inn via `--js` med testbrukeren fra prosjektets egne testfiler, eller noter i `bilder.md` at bildet mangler og må tas manuelt.

Se på det lagrede bildet med `Read` og sjekk at det viser det samme som du så i nettleserpanelet. Er det tomt eller feil tilstand, juster `--js`/`--vent` og ta det på nytt.

## Når du tar bilder

1. **Før du endrer noe som finnes fra før:** hvis oppgaven endrer en eksisterende funksjon, side eller komponent, ta **førbilder** av dagens oppførsel før første kodeendring. Samme tilstand, samme visninger (laptop/mobil) som du skal vise etterpå.
2. **Underveis:** hver gang du i nettleserpanelet har bekreftet at noe fungerer og ser riktig ut, lagre bildet med skriptet med en gang. Ikke vent til slutt.
3. **Etter siste endring:** ta etterbildene på nytt hvis koden er endret siden de ble tatt, så de viser den endelige versjonen. Overskriv filene.
4. **Helt ny funksjon** (ingenting å sammenligne med): bare `ny`-bilder, ingen førbilder.

Ta bilder av det som er nytt eller endret, ikke av alt. Typisk 1 til 4 tilstander, hver i laptop og mobil.

## Hvis du glemte førbildene

Ikke bruk `git stash` (det kan blande inn brukerens andre uncommittede endringer). Lag i stedet en midlertidig kopi av `main`:

```bash
git worktree add <scratchpad>/foer main
cd <scratchpad>/foer && python3 -m http.server 3457
```

Kjør serveren i bakgrunnen, ta førbildene mot `http://localhost:3457`, stopp serveren og fjern kopien med `git worktree remove <scratchpad>/foer`. For backend/review-serveren starter du tilsvarende fra kopien på en ledig port.

## Ikke-visuelle endringer

For backend eller collector: lagre utskriften fra kjøringen eller testene som tekst i samme mappe (f.eks. `03-collector-kjoring-etter.txt`), og før-versjonen hvis oppførselen endres. Er resultatet synlig i appen (f.eks. nye kandidater i review-admin), ta bilde av det også.

## Til PR-en

Når PR-en lages, bruk filene i `.pr-bilder/<branch>/` og tekstene i `bilder.md` direkte under `## Bilder` (se `pr-krav`). Vis før og etter ved siden av hverandre, f.eks. i en tabell med kolonnene «Før» og «Etter». Ta bare nye bilder hvis noe mangler eller koden er endret etter at bildet ble tatt.

Si fra i svaret ditt hvilke bilder som er lagret og hvor, og hvilke som eventuelt mangler.
