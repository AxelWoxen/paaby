# påby

Hyperlokalt oppdagelsesverktøy for Oslo — finn noe å gjøre i kveld.

## Slik legger du til et event

1. Åpne `data/events.js`
2. Kopier MAL-objektet øverst i filen
3. Fyll inn feltene (tittel, kategori, sted, start, pris er påkrevd)
4. Legg objektet til i `EVENTER`-arrayen
5. Lagre filen og last inn appen på nytt

Appen sorterer automatisk etter dato, grupperer per dag, og skjuler eventer som allerede har passert. Du trenger ikke oppgi id, ukedag eller annet — alt utledes fra `start`-feltet.

## Kjøre lokalt

```bash
node server.js
```

Åpne [http://localhost:3000](http://localhost:3000).
