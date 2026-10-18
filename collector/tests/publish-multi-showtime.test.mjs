// publish-multi-showtime.test.mjs — regresjonstest for et scenario ekte
// Ticketmaster-data avdekket: samme produksjon, samme venue, samme DATO,
// to ulike klokkeslett (to Ticketmaster-eventer, to externalId). legacy_id
// er kun dato-granulær, så run.js sin kollisjonshåndtering (se run.js og
// run.test.mjs) disambiguerer det andre showet sin legacy_id.
//
// Dette dekker spørsmålet brukeren stilte eksplisitt: hva skjer når BEGGE
// disse candidatene faktisk godkjennes/publiseres — overlever begge
// visningene gjennom publiserEvent() OG det ekte offentlige lesesporet
// (eventService.getAllEvents()), eller forsvinner/overskriver den ene den
// andre?
//
// Kjører mot lokal paaby_dev. ALDRI mot produksjon. Rydder opp i after().
//
// Kjør: cd collector && node --test tests/publish-multi-showtime.test.mjs

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pool from '../../backend/db/pool.mjs';
import { publiserEvent, lesPubliserte } from '../store/published.js';
import { getAllEvents } from '../../backend/services/eventService.mjs';
import { validerEventer } from '../../js/application/validering.js';

const SLUG = `test-multishow-${crypto.randomUUID().slice(0, 8)}`;
const opprettedeEventIder = [];

after(async () => {
  if (opprettedeEventIder.length) {
    await pool.query(`DELETE FROM events WHERE id = ANY($1)`, [opprettedeEventIder]);
  }
  await pool.query(`DELETE FROM venues WHERE slug = $1`, [SLUG]);
  await pool.end();
});

function lagVisning(klokkeslett, suffiks) {
  return {
    // To forskjellige legacy_id-er for SAMME produksjon samme dag — akkurat
    // slik run.js sin disambiguering (se run.js: "__provider-externalId")
    // faktisk produserer for det andre showet.
    id: suffiks ? `${SLUG}-produksjon-2026-12-05__${suffiks}` : `${SLUG}-produksjon-2026-12-05`,
    tittel: 'Testproduksjon med to visninger',
    kategori: 'pafunn',
    sted: `Testscenen ${SLUG}`,
    adresse: 'Testgate 1',
    lat: 59.9, lng: 10.7,
    start: `2026-12-05T${klokkeslett}:00+01:00`,
    slutt: null,
    pris: 300,
    prisTekst: '300 kr',
    beskrivelse: 'To visninger samme dag, ulikt klokkeslett.',
    lenke: `https://eksempel.no/visning-${klokkeslett}`,
    bilde: null,
    tags: [],
  };
}

test('to showtimes samme dag → publiseres som to separate events, ingen forsvinner eller overskriver den andre', async () => {
  const visning1 = lagVisning('14:30', null);
  const visning2 = lagVisning('18:00', 'ticketmaster-ekstern-id-2');

  const eventId1 = await publiserEvent(visning1, {});
  opprettedeEventIder.push(eventId1);
  const eventId2 = await publiserEvent(visning2, {});
  opprettedeEventIder.push(eventId2);

  // 1. To FORSKJELLIGE events-rader — ingen ON CONFLICT (legacy_id)-kollisjon
  //    som ville overskrevet den ene med den andre.
  assert.notEqual(eventId1, eventId2);

  // 2. Begge occurrences faktisk lagret, med riktig klokkeslett.
  const occurrences = await pool.query(
    `SELECT event_id, starts_at FROM event_occurrences WHERE event_id = ANY($1) ORDER BY starts_at`,
    [[eventId1, eventId2]],
  );
  assert.equal(occurrences.rowCount, 2);
  assert.equal(occurrences.rows[0].starts_at.toISOString(), new Date('2026-12-05T13:30:00Z').toISOString());
  assert.equal(occurrences.rows[1].starts_at.toISOString(), new Date('2026-12-05T17:00:00Z').toISOString());

  // 3. Samme venue gjenbrukt for begge (samme sted/slug) — ikke to venues.
  const venueAntall = await pool.query(
    `SELECT DISTINCT venue_id FROM events WHERE id = ANY($1)`,
    [[eventId1, eventId2]],
  );
  assert.equal(venueAntall.rowCount, 1);

  // 4. collector/review sin egen leser (lesPubliserte) ser begge, med
  //    forskjellig id — ikke samme rad dukket opp to ganger.
  const publiserteCollector = (await lesPubliserte()).filter((e) => e.tittel === visning1.tittel);
  assert.equal(publiserteCollector.length, 2);
  assert.notEqual(publiserteCollector[0].id, publiserteCollector[1].id);

  // 5. DET EKTE OFFENTLIGE LESESPORET (backend/services/eventService.mjs,
  //    det samme getAllEvents() som faktisk server public API-et) — her er
  //    risikoen reell: duplikat id ville blitt STILLE FJERNET av
  //    validerEventer() sin duplikat-id-sjekk (frontend), selv om begge
  //    rader kom riktig ut av databasen.
  // getAllEvents() returnerer rå pg Date-objekter (ingen ISO-konvertering i
  // eventService.mjs selv) — i den ekte appen blir disse alltid ISO-strenger
  // idet Express sitt res.json() serialiserer svaret (Date.toJSON() →
  // toISOString()), FØR frontend/validerEventer() noensinne ser dem. Speil
  // akkurat den grensen her med én JSON-runde, i stedet for å teste noe
  // ingen ekte kodesti faktisk gjør (kalle validerEventer på rå DB-objekter).
  const alleEkte = JSON.parse(JSON.stringify(await getAllEvents()));
  const begge = alleEkte.filter((e) => e.tittel === visning1.tittel);
  assert.equal(begge.length, 2, 'begge visninger skal komme fra getAllEvents()');
  assert.notEqual(begge[0].id, begge[1].id, 'id-ene må være forskjellige for at frontend-valideringen ikke skal droppe den ene');

  const etterValidering = validerEventer(alleEkte).filter((e) => e.tittel === visning1.tittel);
  assert.equal(etterValidering.length, 2, 'ingen av visningene skal bli droppet som "duplikat id" av frontend-valideringen');
});
