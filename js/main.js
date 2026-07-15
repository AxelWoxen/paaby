/* main.js — appens inngangspunkt og orkestrator.
   Koordinerer de tre lagene. */

import { hentEventer }                   from './network/events-api.js';
import { filtrerEventer }                from './application/filtre.js';
import { skjulPasserte, grupperEtterDag } from './application/gruppering.js';
import { hentLagredeIder }               from './application/lagret.js';
import { visEventer }                    from './presentation/feed.js';
import { initModal, åpneModal, lukkModal, hentÅpenEvent } from './presentation/modal.js';


/* ========================
   GLOBAL TILSTAND
   ======================== */

const tilstand = {
  alleEventer: [],

  aktivFiltre: {
    kategori: [],    /* Array — ELLER-logikk, multi-select */
    tid:      null,  /* string | null — enkeltvalg */
    pris:     null,  /* string | null — enkeltvalg */
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
    const lagredeIder = hentLagredeIder(tilstand.alleEventer.map((e) => e.id));
    eventer = tilstand.alleEventer.filter((e) => lagredeIder.includes(e.id));
    /* I lagret-visning: skjul passerte */
    eventer = skjulPasserte(eventer);
  } else {
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
        /* Nærhets-filter: enkel toggle */
        tilstand.aktivFiltre.naerhet = !tilstand.aktivFiltre.naerhet;
        chip.classList.toggle('aktiv', tilstand.aktivFiltre.naerhet);
        chip.setAttribute('aria-pressed', String(tilstand.aktivFiltre.naerhet));

      } else if (type === 'kategori') {
        /* Kategori: multi-select (ELLER) */
        const liste  = tilstand.aktivFiltre.kategori;
        const indeks = liste.indexOf(verdi);
        if (indeks >= 0) {
          liste.splice(indeks, 1);
          chip.classList.remove('aktiv');
        } else {
          liste.push(verdi);
          chip.classList.add('aktiv');
        }

      } else if (type === 'tid' || type === 'pris') {
        /* Tid og pris: enkeltvalg — klikk på aktiv fjerner den, klikk på annen bytter */
        const erAktivNå = tilstand.aktivFiltre[type] === verdi;

        /* Deaktiver eventuelle andre chips i samme gruppe */
        document.querySelectorAll(`[data-filter="${type}"]`).forEach((c) => {
          c.classList.remove('aktiv');
        });

        if (erAktivNå) {
          tilstand.aktivFiltre[type] = null;
        } else {
          tilstand.aktivFiltre[type] = verdi;
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
    tilstand.aktivFiltre.tid   !== null  ||
    tilstand.aktivFiltre.pris  !== null  ||
    tilstand.aktivFiltre.naerhet;

  document.getElementById('nullstill-knapp').classList.toggle('skjult', !harAktive);
}

function initNullstillKnapp() {
  document.getElementById('nullstill-knapp').addEventListener('click', () => {
    tilstand.aktivFiltre = { kategori: [], tid: null, pris: null, naerhet: false };

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

/* Lytter til lagret-endringer fra feed.js og modal.js */
function initLagretSync() {
  document.addEventListener('paaby:lagret-endret', ({ detail: { id, lagret } }) => {
    /* Oppdater modal-hjertet dersom modalen er åpen og viser dette arrangementet */
    const modalHjerte = document.querySelector('.modal-hjerte[data-id]');
    if (modalHjerte?.dataset.id === id) {
      modalHjerte.textContent = lagret ? '♥ lagret' : '♡ lagre';
      modalHjerte.setAttribute('aria-pressed', String(lagret));
    }
    /* Oppdater feeden dersom vi er i lagret-visning */
    if (tilstand.visLagret) oppdaterFeed();
  });
}


/* ========================
   HASH-RUTING
   ======================== */

/* Åpner riktig modal dersom URL inneholder #event/<id>. */
function håndterHash() {
  const match = window.location.hash.match(/^#event\/(.+)$/);
  if (!match) return;

  let id;
  try {
    id = decodeURIComponent(match[1]);
  } catch {
    return; /* ugyldig URL-koding — ignorer */
  }

  const event = tilstand.alleEventer.find((e) => e.id === id);
  if (event) åpneModal(event);
}

function initHashRuting() {
  window.addEventListener('hashchange', () => {
    /* Lukk modal hvis hash er fjernet */
    if (!window.location.hash.startsWith('#event/')) {
      if (hentÅpenEvent()) lukkModal();
      return;
    }
    håndterHash();
  });
}


/* ========================
   OPPSTART
   ======================== */

async function startApp() {
  initModal();
  initFiltre();
  initNullstillKnapp();
  initLagretKnapp();
  initLagretSync();
  initHashRuting();

  try {
    tilstand.alleEventer = await hentEventer();
    oppdaterFeed();
    /* Sjekk hash etter at eventer er lastet */
    håndterHash();
  } catch (feil) {
    const melding = document.createElement('p');
    melding.className   = 'tom-feed';
    melding.textContent = 'klarte ikke laste eventer. er du koblet til internett?';
    document.getElementById('feed').appendChild(melding);
    console.error('Påby: feil ved henting av eventer:', feil);
  }
}

startApp();
