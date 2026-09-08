# Påby

Hyperlokalt oppdagelsesverktøy for Oslo — håndplukkede arrangementer innen musikk, klubb og påfunn.

Live: https://paaby.online

---

## Arkitektur

Påby består av fire hoveddeler:

```text
Frontend
paaby.online
    ↓
Express API
api.paaby.online
    ↓
PostgreSQL
    ↑
Collector + Review
Frontend

Frontend er bygget med:

HTML
CSS
vanilla JavaScript

Det er ingen frontend-build eller rammeverk.

Frontend henter arrangementer gjennom:

js/network/events-api.js

Lokalt:

http://localhost:3000/api/events

Produksjon:

https://api.paaby.online/api/events
Backend

Backend ligger i:

backend/

Struktur:

backend/
├── controllers/
├── db/
│   ├── migrations/
│   └── pool.mjs
├── routes/
├── services/
└── server.mjs

Backend bruker:

Node.js
Express
PostgreSQL
pg
dotenv
cors
Starte backend lokalt

Fra repo-roten:

npm run dev

API-et kjører da på:

http://localhost:3000

Health check:

http://localhost:3000/api/health

Events:

http://localhost:3000/api/events
Database

Lokal database:

paaby_dev

Produksjonsdatabasen ligger på Heroku Postgres.

Viktige tabeller:

venues
events
event_occurrences
categories
event_categories
event_sources
event_candidates
Events

Godkjente arrangementer lagres i events.

Tidspunkter lagres separat i:

event_occurrences

Venue-data lagres i:

venues
Candidates

Arrangementer som collectoren finner lagres i:

event_candidates

Mulige statuser:

pending
approved
rejected

Godkjente candidates kobles til det publiserte eventet gjennom:

published_event_id
Database-migrasjoner

Migrasjoner ligger i:

backend/db/migrations/

Eksempel:

001_initial_schema.sql
002_event_candidates.sql

Kjør lokalt:

psql paaby_dev -f backend/db/migrations/002_event_candidates.sql

Kjør mot produksjon:

heroku pg:psql -a paaby-api -f backend/db/migrations/002_event_candidates.sql
Collector

Collectoren ligger i:

collector/

Den:

henter arrangementer fra kilder
normaliserer data
filtrerer arrangementer til de neste 30 dagene
dedupliserer mot eksisterende data
lagrer nye forslag som pending i PostgreSQL

Adaptere ligger i:

collector/adapters/

Kilder konfigureres i:

collector/config/sources.js
Kjøre collectoren
Lokal database

Fra collector/:

npm run collect

Dette bruker lokal paaby_dev.

Produksjon
npm run collect:prod

Dette leser og skriver candidates mot Heroku Postgres.

Collectoren publiserer ikke events direkte på nettsiden.

Nye funn går først til:

event_candidates
status = pending
Review-verktøy

Review-verktøyet ligger i:

collector/review/

Det brukes til:

godkjenne events
avslå events
legge inn events manuelt
redigere publiserte events
fremheve events
deaktivere / aktivere events
administrere gjentakende events
Starte review lokalt

Fra collector/:

npm run review

Åpne:

http://localhost:3001

Dette bruker lokal paaby_dev.

Review mot produksjon
npm run review:prod

Åpne:

http://localhost:3001

Da jobber review-verktøyet direkte mot produksjonsdatabasen.

Normal eventflyt
npm run collect:prod
        ↓
event_candidates
status = pending
        ↓
npm run review:prod
        ↓
Godkjenn
        ↓
events
        ↓
Express API
        ↓
paaby.online

Et event trenger ikke Git commit eller deploy for å publiseres.

Godkjenning i review:prod skriver direkte til produksjonsdatabasen.

Manuelt event

Manuelle events opprettes gjennom:

Review → Legg til manuelt

Flyt:

Manuelt event
    ↓
event_candidates
status = pending
    ↓
Godkjenn
    ↓
events
    ↓
live
Deploy
Frontend

Frontend deployes fra:

main

til:

https://paaby.online

Endringer i frontend gjøres gjennom feature branch → Pull Request → main.

Backend

Heroku-appen heter:

paaby-api

Produksjons-API:

https://api.paaby.online

Heroku er koblet til GitHub og deployer automatisk fra:

main

med GitHub checks aktivert før deploy.

Normal backend-flyt:

feature branch
    ↓
Pull Request
    ↓
main
    ↓
GitHub checks
    ↓
Heroku automatic deploy
    ↓
api.paaby.online
Lokal utvikling

For å kjøre hele Påby lokalt:

Terminal 1 — backend
npm run dev
Terminal 2 — frontend

Fra repo-roten:

python3 -m http.server 8000

Åpne:

http://localhost:8000

Frontend kobler automatisk til:

http://localhost:3000
Tester

Påby har en nettleserbasert testside:

tester.html

Start backend:

npm run dev

Start frontend-server:

python3 -m http.server 8000

Åpne:

http://localhost:8000/tester.html

Testene dekker blant annet:

validering
URL-er
passerte events
helgelogikk
kategorier
standardbilder
koordinater
avstand
sortering
uke-navigering
data fra API-et
Kategorier

Påby bruker tre kategorier:

musikk
klubb
pafunn

Standardbilder:

bilder/kategorier/musikk.jpg
bilder/kategorier/klubb.jpg
bilder/kategorier/pafunn.jpg

mat er ikke lenger en aktiv kategori.

SEO og ukesarkiv

Ukesidene ligger i:

uke/

De brukes som statiske, søkbare arkivsider for håndplukkede ukesutvalg.

Eksempel:

uke/2026-08-10.html

Når en ny side lages:

kopier forrige ukes HTML
oppdater metadata og innhold
legg siden til i uke/index.html
legg URL-en til i sitemap.xml
test lokalt
commit gjennom normal Git-flyt
Legacy-data

Filen:

data/events.json

er ikke lenger Påbys aktive datakilde.

Den beholdes foreløpig kun som historisk seed/backup fra tiden før PostgreSQL.

Engangsimporten ligger i:

backend/db/importEvents.mjs

Normal drift skal ikke lese eller skrive events.json.

Daglig arbeidsflyt

For å hente inn nye events:

cd collector
npm run collect:prod

For å reviewe og publisere:

npm run review:prod

Deretter brukes review-grensesnittet på:

http://localhost:3001

Det kreves ingen Git commit for eventinnhold.

Git brukes kun for kode- og designendringer.


