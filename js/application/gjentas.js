/* gjentas.js — logikk for tilbakevendende eventer.
   Rene funksjoner, ingen DOM, ingen fetch.

   DATAFORMAT — event.gjentas (valgfritt felt):
     "ukentlig:søndag"          → vises hver søndag
     "månedlig:siste-torsdag"   → vises siste torsdag i måneden
     "månedlig:første-søndag"   → vises første søndag i måneden

   Gyldige ukedagnavn: mandag tirsdag onsdag torsdag fredag lørdag søndag

   Eksempel:
     {
       "id":      "frank-znort-blaa-2026-07-19",
       "tittel":  "Frank Znort Quartet",
       "start":   "2026-07-19T16:30:00+02:00",   ← klokkeslett + ikke-før-dato
       "gjentas": "ukentlig:søndag",
       ...
     }

   base-eventet erstattes med individuelle forekomster; hvert får sitt eget id
   på formen "<base-id>__YYYY-MM-DD".
*/

import { osloKomponenter, lagOsloDato } from './oslo-tid.js';

/* Dager fremover vi genererer forekomster for */
const HORISONT_DAGER = 90;

const UKEDAG_NR = {
  søndag: 0, mandag: 1, tirsdag: 2, onsdag: 3,
  torsdag: 4, fredag: 5, lørdag: 6,
};


/* ========================
   PARSING
   ======================== */

function parseGjentas(gjentas) {
  if (!gjentas || typeof gjentas !== 'string') return null;

  const kolon  = gjentas.indexOf(':');
  const type   = kolon < 0 ? gjentas : gjentas.slice(0, kolon);
  const detalj = kolon < 0 ? '' : gjentas.slice(kolon + 1);

  if (type === 'ukentlig') {
    const ukedag = UKEDAG_NR[detalj];
    if (ukedag === undefined) {
      console.warn(`Påby gjentas: ukjent ukedag "${detalj}"`);
      return null;
    }
    return { type: 'ukentlig', ukedag };
  }

  if (type === 'månedlig') {
    const m = detalj.match(/^(siste|første)-(.+)$/);
    if (!m) {
      console.warn(`Påby gjentas: ukjent månedlig-mønster "${detalj}"`);
      return null;
    }
    const ukedag = UKEDAG_NR[m[2]];
    if (ukedag === undefined) {
      console.warn(`Påby gjentas: ukjent ukedag "${m[2]}"`);
      return null;
    }
    return { type: m[1] === 'siste' ? 'månedlig-siste' : 'månedlig-første', ukedag };
  }

  console.warn(`Påby gjentas: ukjent type "${type}"`);
  return null;
}


/* ========================
   DATO-HJELP
   ======================== */

/* Formaterer et Date-objekt til ISO-streng med korrekt Oslo-offset (+01:00 / +02:00). */
function datoTilOsloISO(dato) {
  const k    = osloKomponenter(dato);
  const p    = (n) => String(n).padStart(2, '0');
  /* Offset: sammenlign Oslo-time med UTC-time — gir 1 (vinter) eller 2 (sommer). */
  const diff = ((k.time - dato.getUTCHours()) + 24) % 24;
  const tz   = diff === 1 ? '+01:00' : '+02:00';
  return `${k.år}-${p(k.maned)}-${p(k.dag)}T${p(k.time)}:${p(k.min)}:00${tz}`;
}

/* Lager ett event-objekt for én konkret forekomst. */
function lagForekomst(baseEvent, startDato, durMs) {
  const k          = osloKomponenter(startDato);
  const p          = (n) => String(n).padStart(2, '0');
  const datoNøkkel = `${k.år}-${p(k.maned)}-${p(k.dag)}`;
  const sluttDato  = durMs > 0 ? new Date(startDato.getTime() + durMs) : null;

  return {
    ...baseEvent,
    id:    `${baseEvent.id}__${datoNøkkel}`,
    start: datoTilOsloISO(startDato),
    slutt: sluttDato ? datoTilOsloISO(sluttDato) : null,
  };
}


/* ========================
   UKENTLIG
   ======================== */

function genererUkentlige(ukedag, baseEvent, fraDato, tilDato, durMs) {
  const { time, min } = osloKomponenter(new Date(baseEvent.start));
  const resultater    = [];

  /* Flytt cursor til nærmeste forekomst av riktig ukedag ≥ fraDato */
  let cursor = new Date(fraDato.getTime());
  const dagerTil = (ukedag - osloKomponenter(cursor).ukedag + 7) % 7;
  cursor.setUTCDate(cursor.getUTCDate() + dagerTil);

  while (true) {
    const kC          = osloKomponenter(cursor);
    const forekomst   = lagOsloDato(kC.år, kC.maned, kC.dag, time, min, 0);
    if (forekomst > tilDato) break;
    if (forekomst >= fraDato) resultater.push(lagForekomst(baseEvent, forekomst, durMs));
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }

  return resultater;
}


/* ========================
   SISTE [UKEDAG] I MÅNEDEN
   ======================== */

function genererMånedligSiste(ukedag, baseEvent, fraDato, tilDato, durMs) {
  const { time, min } = osloKomponenter(new Date(baseEvent.start));
  const resultater    = [];

  const kFra  = osloKomponenter(fraDato);
  let år      = kFra.år;
  let maned   = kFra.maned;

  while (true) {
    /* Finn siste dag i denne måneden (Oslo-tid).
       Bruk middag for å unngå DST-kanttilfeller ved trekk av 24 t. */
    const nesteManedDato = lagOsloDato(
      maned === 12 ? år + 1 : år,
      maned === 12 ? 1 : maned + 1,
      1, 12, 0, 0,
    );
    const sisteDagDato = new Date(nesteManedDato.getTime() - 24 * 60 * 60 * 1000);
    const kSiste       = osloKomponenter(sisteDagDato);

    /* Gå tilbake til siste forekomst av ønsket ukedag */
    const diff      = (kSiste.ukedag - ukedag + 7) % 7;
    const forekomst = lagOsloDato(år, maned, kSiste.dag - diff, time, min, 0);

    if (forekomst > tilDato) break;
    if (forekomst >= fraDato) resultater.push(lagForekomst(baseEvent, forekomst, durMs));

    maned++;
    if (maned > 12) { maned = 1; år++; }
  }

  return resultater;
}


/* ========================
   FØRSTE [UKEDAG] I MÅNEDEN
   ======================== */

function genererMånedligFørste(ukedag, baseEvent, fraDato, tilDato, durMs) {
  const { time, min } = osloKomponenter(new Date(baseEvent.start));
  const resultater    = [];

  const kFra  = osloKomponenter(fraDato);
  let år      = kFra.år;
  let maned   = kFra.maned;

  while (true) {
    /* Finn første dag i denne måneden (Oslo-tid), bruk middag for å unngå DST-kanttilfeller. */
    const førsteDagDato = lagOsloDato(år, maned, 1, 12, 0, 0);
    const kFørste        = osloKomponenter(førsteDagDato);

    /* Gå fram til første forekomst av ønsket ukedag */
    const diff      = (ukedag - kFørste.ukedag + 7) % 7;
    const forekomst = lagOsloDato(år, maned, kFørste.dag + diff, time, min, 0);

    if (forekomst > tilDato) break;
    if (forekomst >= fraDato) resultater.push(lagForekomst(baseEvent, forekomst, durMs));

    maned++;
    if (maned > 12) { maned = 1; år++; }
  }

  return resultater;
}


/* ========================
   EKSPORT
   ======================== */

/**
 * Utvider alle gjentakende eventer til individuelle forekomster.
 * Ikke-gjentakende eventer passerer uendret gjennom.
 *
 * @param {Object[]} alleEventer
 * @param {Date}     [nå]          Startpunkt for generering (default: new Date())
 * @returns {Object[]}
 */
export function utvidGjentakende(alleEventer, nå = new Date()) {
  const tilDato  = new Date(nå.getTime() + HORISONT_DAGER * 24 * 60 * 60 * 1000);
  const resultat = [];

  for (const event of alleEventer) {
    const regel = parseGjentas(event.gjentas);

    if (!regel) {
      /* Vanlig engangsevent — uendret videre */
      resultat.push(event);
      continue;
    }

    /* Gjentakende: start ikke før event.start (valid-from), men minimum nå */
    const effektivFra = new Date(Math.max(nå.getTime(), new Date(event.start).getTime()));
    const durMs       = event.slutt
      ? new Date(event.slutt).getTime() - new Date(event.start).getTime()
      : 0;

    if (regel.type === 'ukentlig') {
      resultat.push(...genererUkentlige(regel.ukedag, event, effektivFra, tilDato, durMs));
    } else if (regel.type === 'månedlig-siste') {
      resultat.push(...genererMånedligSiste(regel.ukedag, event, effektivFra, tilDato, durMs));
    } else if (regel.type === 'månedlig-første') {
      resultat.push(...genererMånedligFørste(regel.ukedag, event, effektivFra, tilDato, durMs));
    }
    /* Ukjent regel: base-eventet droppes (parseGjentas har allerede logget advarsel) */
  }

  return resultat;
}
