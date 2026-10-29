---
name: pr-krav
description: Bruk alltid når brukeren vil lage en pull request (PR) i paaby. Hver PR må ha bilder som viser det nye og en oppskrift på hvordan man tester selv.
---

# Krav til pull requests

Det er påbudt at hver PR har både **bilder** og en **testoppskrift**. Ikke opprett PR-en før begge deler er med.

## 1. Bilder av det nye

- Ta skjermbilder som viser det som er nytt eller endret (UI, kart, modal osv.). Bruk gjerne før/etter når noe er endret.
- Er endringen ikke visuell (f.eks. backend eller collector), vis i stedet utskrift fra kjøring, loggutdrag eller et skjermbilde av resultatet i appen.
- Legg bildene i PR-beskrivelsen under overskriften `## Bilder`, med en kort bildetekst på hvert. Bildefilene må være tilgjengelige for den som leser PR-en (f.eks. lastet opp til PR-en), ikke bare lokale stier.
- Får du ikke tatt bilder selv, spør brukeren om å legge dem ved før PR-en opprettes.

## 2. Oppskrift for å teste selv

Under overskriften `## Slik tester du` skal det stå:

1. Hvordan man får koden: hvilken branch som skal sjekkes ut.
2. Hvordan man starter prosjektet (kommandoer, eventuelle miljøvariabler eller testdata).
3. Konkrete steg som nummerert liste: hva man åpner, klikker på eller kjører.
4. Forventet resultat for hvert steg.
5. Eventuelle kanttilfeller som bør sjekkes.

## Ellers

- PR-en skal gå fra en feature-branch, aldri fra `main` (se `branch-workflow`).
- Legg også med en kort `## Hva er endret` øverst.
