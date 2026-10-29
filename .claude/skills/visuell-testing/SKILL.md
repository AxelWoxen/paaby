---
name: visuell-testing
description: Bruk alltid etter hver visuell endring i paaby (HTML, CSS, JS som påvirker UI). Endringen må testes både på laptop i full størrelse og på mobiltelefon før den regnes som ferdig.
---

# Visuell testing: laptop og mobil

Hver visuelle endring skal verifiseres i **begge** visninger. Ikke si at noe er ferdig eller verifisert før begge er sjekket.

## Slik gjør du det

1. Start prosjektet og åpne siden i nettleseren (bruk den innebygde nettleseren, `preview_start`).
2. **Laptop, full størrelse:** sett vinduet til desktop (`resize_window` med preset `desktop`, eller f.eks. 1440x900). Sjekk layout, avstander, tekst, interaksjoner (klikk, hover, modal, kart) og konsollfeil. Ta skjermbilde.
3. **Mobil:** sett vinduet til mobil (`resize_window` med preset `mobile`, 375x812). Last siden på nytt etter bytte. Sjekk at ingenting flyter over eller klippes, at tekst er lesbar, at knapper er enkle å treffe, og at interaksjoner fungerer med touch-størrelser. Ta skjermbilde.
4. Test de samme brukerflytene i begge visninger, ikke bare at siden laster.
5. Fiks feil som dukker opp i en av visningene og test begge på nytt.
6. Sett vinduet tilbake til desktop når du er ferdig.

## Rapportering

- Si eksplisitt at du har testet både laptop og mobil, og nevn hva du fant.
- Skjermbildene fra begge visninger kan gjenbrukes som bilder i PR-en (se `pr-krav`).
- Kan du ikke teste en av visningene, si det tydelig i stedet for å anta at det fungerer.
