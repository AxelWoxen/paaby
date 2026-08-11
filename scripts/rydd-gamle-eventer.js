#!/usr/bin/env node
/* rydd-gamle-eventer.js — fjerner passerte engangseventer fra data/events.json.
   Kjøres manuelt ved behov:

     node scripts/rydd-gamle-eventer.js

   Regel:
   - Eventer UTEN «gjentas» fjernes hvis effektiv sluttid (slutt-feltet, eller
     start + 4 timer hvis slutt mangler — samme fallback som README beskriver)
     er mer enn DAGER_TERSKEL dager tilbake i tid.
   - Eventer MED «gjentas» fjernes ALDRI, uansett hvor gammel start-datoen er —
     de er ankerdatoer utvidGjentakende() (js/application/gjentas.js) bruker
     til å generere fremtidige forekomster.

   Ingen npm-avhengigheter — kun Node sine innebygde fs/path. */

const fs   = require('fs');
const path = require('path');

const DAGER_TERSKEL         = 5;
const FALLBACK_VARIGHET_MS  = 4 * 60 * 60 * 1000; /* start + 4 timer, jf. README */
const EVENTS_FIL            = path.join(__dirname, '..', 'data', 'events.json');

function effektivSluttMs(event) {
  const startMs = new Date(event.start).getTime();
  if (event.slutt) {
    const sluttMs = new Date(event.slutt).getTime();
    if (!isNaN(sluttMs)) return sluttMs;
  }
  return startMs + FALLBACK_VARIGHET_MS;
}

function main() {
  const rått    = fs.readFileSync(EVENTS_FIL, 'utf8');
  const eventer = JSON.parse(rått);

  const terskelMs = Date.now() - DAGER_TERSKEL * 24 * 60 * 60 * 1000;

  const beholdt  = [];
  const fjernet  = [];

  for (const event of eventer) {
    if (event.gjentas) {
      beholdt.push(event); /* ankerdato — rør aldri */
      continue;
    }

    const startMs = new Date(event.start).getTime();
    if (isNaN(startMs)) {
      beholdt.push(event); /* ugyldig dato — behold heller enn å risikere feil sletting */
      continue;
    }

    if (effektivSluttMs(event) < terskelMs) {
      fjernet.push(event.id);
    } else {
      beholdt.push(event);
    }
  }

  fs.writeFileSync(EVENTS_FIL, JSON.stringify(beholdt, null, 2) + '\n', 'utf8');

  console.log(`Fjernet ${fjernet.length} arrangement${fjernet.length === 1 ? '' : 'er'} (eldre enn ${DAGER_TERSKEL} dager, uten gjentas):`);
  if (fjernet.length === 0) {
    console.log('  (ingen)');
  } else {
    fjernet.forEach((id) => console.log(`  - ${id}`));
  }
  console.log(`\nBeholdt ${beholdt.length} av ${eventer.length} arrangementer totalt.`);
}

main();
