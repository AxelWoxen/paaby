/* main.js — appens inngangspunkt og orkestrator.
   Koordinerer de tre lagene. Lagene importerer IKKE fra hverandre
   (unntatt presentation → application, som er tillatt). */

import { hentEventer }                    from './network/events-api.js';
import { filtrerEventer }                  from './application/filtre.js';
import { skjulPasserte, grupperEtterDag }  from './application/gruppering.js';
import { hentPosisjon, kalkulerAvstand }   from './application/posisjon.js';
import { hentLagredeIder }                 from './application/lagret.js';
import { visEventer }                      from './presentation/feed.js';
import { initModal }                       from './presentation/modal.js';
import { initKart, visKart, skjulKart }    from './presentation/kart.js';


/* ========================
   GLOBAL TILSTAND
   ======================== */

const tilstand = {
  alleEventer: [],

  aktivFiltre: {
    kategori: [],   /* Array: [] = vis alle, ['musikk','klubb'] = vis begge */
    tid:      [],   /* Array: [] = vis alle, ['i-kveld'] = kun i dag */
    pris:     [],   /* Array: [] = vis alle, ['gratis','under-200'] = billig */
    naerhet:  false,
  },

  brukerPosisjon: null,
  visLagret:      false,
};


/* ========================
   OPPDATER FEED
   ======================== */

function oppdaterFeed() {
  let eventer;

  if (tilstand.visLagret) {
    const lagredeIder = hentLagredeIder();
    /* I lagret-visning viser vi alle lagrede eventer, inkludert passerte */
    eventer = tilstand.alleEventer.filter((e) => lagredeIder.includes(e.id));
  } else {
    /* Skjul passerte, kjør så gjennom filtrene */
    const aktive = skjulPasserte(tilstand.alleEventer);
    eventer = filtrerEventer(aktive, tilstand.aktivFiltre, tilstand.brukerPosisjon);
  }

  const dagGrupper   = grupperEtterDag(eventer, tilstand.brukerPosisjon, tilstand.aktivFiltre.naerhet);
  const totaltAntall = dagGrupper.reduce((sum, g) => sum + g.eventer.length, 0);

  visEventer(dagGrupper, tilstand.visLagret);
  oppdaterTreffLinje(totaltAntall);
}

function oppdaterTreffLinje(antall) {
  const teller       = document.getElementById('treff-teller');
  const tilbakeKnapp = document.getElementById('vis-alle');

  if (tilstand.visLagret) {
    teller.textContent = antall === 0 ? 'ingenting lagret' : `${antall} forslag lagret`;
    tilbakeKnapp.classList.remove('skjult');
  } else {
    teller.textContent = `${antall} forslag`;
    tilbakeKnapp.classList.add('skjult');
  }
}


/* ========================
   FILTRE
   ======================== */

function initFiltre() {
  document.querySelectorAll('[data-filter]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const type  = chip.dataset.filter;
      const verdi = chip.dataset.verdi;

      if (type === 'naerhet') {
        /* Nærhets-filter er en enkel on/off-toggle */
        tilstand.aktivFiltre.naerhet = !tilstand.aktivFiltre.naerhet;
        chip.classList.toggle('aktiv', tilstand.aktivFiltre.naerhet);
        chip.setAttribute('aria-pressed', String(tilstand.aktivFiltre.naerhet));
      } else {
        /* Kategori, tid, pris: legg til/fjern fra array (multi-select) */
        const liste  = tilstand.aktivFiltre[type];
        const indeks = liste.indexOf(verdi);

        if (indeks >= 0) {
          liste.splice(indeks, 1);
          chip.classList.remove('aktiv');
        } else {
          liste.push(verdi);
          chip.classList.add('aktiv');
        }
      }

      oppdaterNullstillKnapp();
      oppdaterFeed();
    });
  });
}

function oppdaterNullstillKnapp() {
  const harAktive =
    tilstand.aktivFiltre.kategori.length > 0 ||
    tilstand.aktivFiltre.tid.length > 0 ||
    tilstand.aktivFiltre.pris.length > 0 ||
    tilstand.aktivFiltre.naerhet;

  document.getElementById('nullstill-knapp').classList.toggle('skjult', !harAktive);
}

function initNullstillKnapp() {
  document.getElementById('nullstill-knapp').addEventListener('click', () => {
    tilstand.aktivFiltre = { kategori: [], tid: [], pris: [], naerhet: false };

    document.querySelectorAll('.chip').forEach((c) => {
      c.classList.remove('aktiv');
      if (c.dataset.filter === 'naerhet') c.setAttribute('aria-pressed', 'false');
    });

    oppdaterNullstillKnapp();
    oppdaterFeed();
  });
}


/* ========================
   LAGRET-VISNING
   ======================== */

function initLagretKnapp() {
  const visLagretKnapp = document.getElementById('vis-lagret');
  const visAlleKnapp   = document.getElementById('vis-alle');

  visLagretKnapp.addEventListener('click', () => {
    tilstand.visLagret = true;
    visLagretKnapp.classList.add('aktiv');
    visLagretKnapp.setAttribute('aria-pressed', 'true');
    oppdaterFeed();
  });

  visAlleKnapp.addEventListener('click', () => {
    tilstand.visLagret = false;
    visLagretKnapp.classList.remove('aktiv');
    visLagretKnapp.setAttribute('aria-pressed', 'false');
    oppdaterFeed();
  });
}


/* ========================
   KART (valgfritt)
   ======================== */

function initKartKnapp() {
  const kartKnapp     = document.getElementById('vis-kart');
  const lukkKartKnapp = document.getElementById('lukk-kart');

  if (!kartKnapp) return;

  kartKnapp.addEventListener('click', () => visKart());

  if (lukkKartKnapp) {
    lukkKartKnapp.addEventListener('click', () => skjulKart());
  }
}


/* ========================
   OPPSTART
   ======================== */

async function startApp() {
  initModal();
  initFiltre();
  initNullstillKnapp();
  initLagretKnapp();
  initKartKnapp();

  try {
    tilstand.alleEventer = await hentEventer();
    oppdaterFeed();
    initKart(tilstand.alleEventer);
  } catch (feil) {
    document.getElementById('feed').innerHTML =
      '<p class="tom-feed">klarte ikke laste eventer. er du koblet til internett?</p>';
    console.error('Påby: feil ved henting av eventer:', feil);
    return;
  }

  /* Hent posisjon i bakgrunnen — appen er allerede synlig og brukbar */
  hentPosisjon().then((posisjon) => {
    if (!posisjon) return;

    tilstand.brukerPosisjon = posisjon;

    /* Legg _avstand på eventer som har koordinater */
    tilstand.alleEventer = tilstand.alleEventer.map((event) => ({
      ...event,
      _avstand: (event.lat != null && event.lng != null)
        ? kalkulerAvstand(posisjon, { lat: event.lat, lng: event.lng })
        : null,
    }));

    oppdaterFeed();
  });
}

startApp();
