// Review-server for Påby.
//
// Kjør fra collector/-mappen:
//   npm run review
//
// Åpne:
//   http://localhost:3001

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';


import {
  lesCandidates,
  leggTilCandidates,
  markerGodkjent,
  markerAvslatt,
} from '../store/candidates-db.js';

import { normaliser } from '../normalize.js';
import { dedupliser } from '../dedupe.js';
import { utvidGjentakende } from '../../js/application/gjentas.js';

import {
  lesPubliserte,
  publiserEvent,
  toggleFremhevet,
  toggleDeaktivert,
  oppdaterPublisertEvent,
  oppdaterGjentas,
} from '../store/published.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));


// ─── Hjelpefunksjoner ───────────────────────────────────────────────────────

// Gjentakende events lagres som ett grunn-event i databasen.
// I review-verktøyet viser vi neste faktiske forekomst, slik at et event
// ikke fremstår som avsluttet bare fordi grunn-datoen ligger i fortiden.
//
// Eventets opprinnelige id beholdes, siden redigering, fremheving,
// deaktivering og gjentas-endepunktene jobber mot grunn-eventet.
function medNesteForekomst(eventer, nå = new Date()) {
  return eventer.map((event) => {
    if (!event.gjentas) return event;

    const [nesteForekomst] = utvidGjentakende([event], nå);

    if (!nesteForekomst) return event;

    return {
      ...event,
      start: nesteForekomst.start,
      slutt: nesteForekomst.slutt,
    };
  });
}

function tekstEllerNull(verdi) {
  return typeof verdi === 'string' && verdi.trim() !== ''
    ? verdi.trim()
    : null;
}

function tallEllerNull(verdi) {
  return verdi === '' || verdi == null
    ? null
    : Number(verdi);
}


// ─── Express ────────────────────────────────────────────────────────────────

const app = express();

// Standardgrensen på 100kb er for lav når review-verktøyet sender
// beskårne bilder som data-URL.
app.use(express.json({ limit: '10mb' }));

// Server review-grensesnittet fra collector/review/public.
app.use(express.static(path.join(__dirname, 'public')));


// ─── Candidates ─────────────────────────────────────────────────────────────

// Hent alle events som venter på review.
app.get('/api/candidates', async (_req, res) => {
  const alle = await lesCandidates();

  res.json(
    alle.filter((event) => event._status === 'pending'),
  );
});


// Avslå candidate.
//
// Kandidaten markeres som avslått og id-en lagres i rejected.json,
// slik at collectoren ikke foreslår samme event igjen senere.
app.post('/api/avslaa/:id', async (req, res) => {
  try {
    const ok = await markerAvslatt(req.params.id);

    if (!ok) {
      return res.status(404).json({
        feil: 'Event ikke funnet',
      });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Kunne ikke avslå event:', err);

    res.status(500).json({
      feil: 'Kunne ikke avslå event',
    });
  }
});


// Godkjenn candidate.
//
// Eventet publiseres til PostgreSQL og kandidaten markeres deretter
// som godkjent i candidates.json.
app.post('/api/godkjenn/:id', async (req, res) => {
  const { id } = req.params;
  const {
    kuratortekst,
    fremhevet,
    gjentas,
  } = req.body ?? {};

  const alle = await lesCandidates();

  const event = alle.find((candidate) => candidate.id === id);

  if (!event) {
    return res.status(404).json({
      feil: 'Event ikke funnet',
    });
  }

  try {
    const publishedEventId = await publiserEvent(event, {
  kuratortekst,
  fremhevet,
  gjentas,
});

await markerGodkjent(
  id,
  publishedEventId,
);  

    res.json({
      ok: true,
      publisertTil: 'database',
    });
  } catch (err) {
    console.error('Kunne ikke publisere event:', err);

    res.status(500).json({
      feil: 'Kunne ikke publisere event',
    });
  }
});


// ─── Publiserte events ──────────────────────────────────────────────────────

// Hent publiserte events direkte fra PostgreSQL.
app.get('/api/publiserte', async (_req, res) => {
  try {
    const eventer = await lesPubliserte();

    res.json(
      medNesteForekomst(eventer),
    );
  } catch (err) {
    console.error(
      'Kunne ikke hente publiserte events:',
      err.message,
    );

    res.status(500).json({
      feil: 'Kunne ikke hente publiserte events',
    });
  }
});


// Oppdater gjentakelsesregel på publisert event.
app.post('/api/gjentas/:id', async (req, res) => {
  const { gjentas } = req.body ?? {};

  try {
    const resultat = await oppdaterGjentas(
      req.params.id,
      gjentas,
    );

    if (!resultat.funnet) {
      return res.status(404).json({
        feil: 'Event ikke funnet',
      });
    }

    res.json({
      ok: true,
      gjentas: resultat.gjentas,
    });
  } catch (err) {
    console.error(
      'Kunne ikke oppdatere gjentas:',
      err,
    );

    res.status(500).json({
      feil: 'Kunne ikke oppdatere gjentas',
    });
  }
});


// Slå fremheving av/på.
app.post('/api/fremhev/:id', async (req, res) => {
  try {
    const fremhevet = await toggleFremhevet(
      req.params.id,
    );

    if (fremhevet === null) {
      return res.status(404).json({
        feil: 'Event ikke funnet',
      });
    }

    res.json({
      ok: true,
      fremhevet,
    });
  } catch (err) {
    console.error(
      'Kunne ikke endre fremhevet:',
      err,
    );

    res.status(500).json({
      feil: 'Kunne ikke endre fremhevet',
    });
  }
});


// Deaktiver eller aktiver publisert event.
//
// Eventet slettes ikke fra databasen. Status byttes mellom
// "active" og "inactive", slik at handlingen enkelt kan angres.
app.post('/api/deaktiver/:id', async (req, res) => {
  try {
    const deaktivert = await toggleDeaktivert(
      req.params.id,
    );

    if (deaktivert === null) {
      return res.status(404).json({
        feil: 'Event ikke funnet',
      });
    }

    res.json({
      ok: true,
      deaktivert,
    });
  } catch (err) {
    console.error(
      'Kunne ikke deaktivere/aktivere event:',
      err,
    );

    res.status(500).json({
      feil: 'Kunne ikke endre event-status',
    });
  }
});


// Full redigering av publisert event.
//
// Gjentas, fremhevet og deaktivert styres av egne endepunkter.
app.post('/api/oppdater/:id', async (req, res) => {
  const body = req.body ?? {};

  const tittel = body.tittel?.trim();
  const start = body.start?.trim();

  if (!tittel || !start) {
    return res.status(400).json({
      feil: 'Tittel og starttidspunkt er påkrevd',
    });
  }

  try {
    const ok = await oppdaterPublisertEvent(
      req.params.id,
      {
        tittel,
        kategori: body.kategori,

        sted: tekstEllerNull(body.sted),
        adresse: tekstEllerNull(body.adresse),

        lat: tallEllerNull(body.lat),
        lng: tallEllerNull(body.lng),

        start,
        slutt: tekstEllerNull(body.slutt),

        pris: tallEllerNull(body.pris),
        prisTekst: tekstEllerNull(body.prisTekst),

        beskrivelse: tekstEllerNull(body.beskrivelse),
        kuratortekst: tekstEllerNull(body.kuratortekst),

        lenke: tekstEllerNull(body.lenke),
        bilde: tekstEllerNull(body.bilde),
      },
    );

    if (!ok) {
      return res.status(404).json({
        feil: 'Event ikke funnet',
      });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(
      'Kunne ikke oppdatere event:',
      err,
    );

    res.status(500).json({
      feil: 'Kunne ikke oppdatere event',
    });
  }
});


// ─── Manuelle events ────────────────────────────────────────────────────────

// Opprett manuelt event.
//
// Manuelle events går først til candidates.json og må godkjennes på samme
// måte som events collectoren finner automatisk.
app.post('/api/manuell', async (req, res) => {
  const body = req.body ?? {};

  const pris =
    body.pris !== '' && body.pris != null
      ? Number(body.pris)
      : null;

  // Review-formen sender lokal Oslo-tid uten timezone.
  // Denne gjøres om til ISO-formatet som normalize.js forventer.
  const tilOsloISO = (verdi) =>
    verdi
      ? `${verdi.trim().slice(0, 16)}:00+02:00`
      : null;

  // Bygg et råobjekt som normalize.js kan behandle på samme måte
  // som events fra broadcast-adapteren.
  const råEvent = {
    name: body.tittel,
    start_time: tilOsloISO(body.start),

    details: body.beskrivelse ?? '',
    tagsFlattened: '',

    custom_fields: {
      type:
        body.kategori === 'klubb'
          ? 'Club'
          : 'Concert',

      end_time: tilOsloISO(body.slutt),

      freeEntry: pris === 0,

      cover:
        pris
          ? String(pris)
          : '',

      ticketUrl: body.lenke ?? '',
    },

    place: {
      name: body.sted,
      address: body.adresse ?? '',
      city: 'Oslo',
      postal_code: '',

      latitude:
        body.lat
          ? Number(body.lat)
          : null,

      longitude:
        body.lng
          ? Number(body.lng)
          : null,
    },

    imagekit:
      body.bilde
        ? { url: body.bilde }
        : null,

    _source: {
      defaultKategori: body.kategori ?? 'musikk',

      sted: body.sted,
      adresse: body.adresse ?? null,

      lat:
        body.lat
          ? Number(body.lat)
          : null,

      lng:
        body.lng
          ? Number(body.lng)
          : null,
    },
  };

  const event = normaliser(råEvent);

  if (!event.tittel || !event.start) {
    return res.status(400).json({
      feil: 'Tittel og starttidspunkt er påkrevd',
    });
  }

  // Bruk kategorien valgt i review-verktøyet direkte.
  event.kategori =
    body.kategori ?? event.kategori;

  if (body.gjentas) {
    event.gjentas = body.gjentas;
  }

  // Sjekk både review-køen og publiserte events i PostgreSQL.
  const [candidates, publiserte] = await Promise.all([
    lesCandidates(),
    lesPubliserte(),
  ]);

  const nye = dedupliser(
    [event],
    [...candidates, ...publiserte],
  );

  if (nye.length === 0) {
    return res.status(409).json({
      feil: 'Duplikat — dette eventet finnes allerede',
    });
  }

  await leggTilCandidates(nye);

  res.json({
    ok: true,
    id: event.id,
  });
});


// ─── Start ──────────────────────────────────────────────────────────────────

const PORT = 3001;

app.listen(PORT, () => {
  console.log(
    `Review-server kjører på http://localhost:${PORT}`,
  );

  console.log('Stopp med Ctrl+C');
});