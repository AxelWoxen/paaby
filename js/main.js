/* main.js — appens inngangspunkt og orkestrator.
   Koordinerer de tre lagene. */

import { hentEventer }                             from './network/events-api.js';
import { filtrerEventer }                          from './application/filtre.js';
import { skjulPasserte, grupperEtterDag }          from './application/gruppering.js';
import { sorterEventer, erAvstandsSortering,
         erTidsSortering }                         from './application/sortering.js';
import { hentPosisjon, kalkulerAvstand }           from './application/posisjon.js';
import { hentLagredeIder }                         from './application/lagret.js';
import { visEventer }                              from './presentation/feed.js';
import { initModal, åpneModal, lukkModal,
         hentÅpenEvent }                           from './presentation/modal.js';
import { aktiverSporing, trackEvent }              from './application/sporing.js';


/* ========================
   GLOBAL TILSTAND
   ======================== */

const tilstand = {
  alleEventer: [],

  aktivFiltre: {
    kategori: [],    /* Array — ELLER-logikk, multi-select */
    tid:      null,  /* string | null — enkeltvalg */
    pris:     null,  /* string | null — enkeltvalg */
    naerhet:  false, /* ubrukt — ingen chip i HTML, men beholdes for bakoverkompatibilitet */
  },

  sortering:      'tid-stigende',  /* Standardsortering */
  brukerPosisjon: null,            /* { lat, lng } eller null — aldri satt ved sidelast */
  visAvstand:     false,           /* Viser avstand på kort og i modal */
  posisjonLastes: false,           /* Mutex — hindrer samtidige geolocation-forespørsler */
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
    eventer = skjulPasserte(eventer);
  } else {
    const aktive = skjulPasserte(tilstand.alleEventer);
    eventer = filtrerEventer(aktive, tilstand.aktivFiltre, tilstand.brukerPosisjon);
  }

  /* Legg til _avstand (internt felt i km) på hvert event dersom avstand er aktiv.
     _avstand = null betyr at arrangementet mangler koordinater. */
  if (tilstand.visAvstand && tilstand.brukerPosisjon) {
    eventer = eventer.map((e) => {
      if (e.lat == null || e.lng == null) return { ...e, _avstand: null };
      const km = kalkulerAvstand(tilstand.brukerPosisjon, { lat: e.lat, lng: e.lng });
      return { ...e, _avstand: km };
    });
  }
  /* Dersom visAvstand er false fjernes _avstand implisitt —
     dataene fra tilstand.alleEventer har aldri _avstand satt. */

  /* Fallback: bruk tidssortering dersom avstandssortering er valgt men avstand er av.
     Endrer ikke tilstand.sortering — kun intern override for denne rendringen. */
  const effektivSortering =
    erAvstandsSortering(tilstand.sortering) && !tilstand.visAvstand
      ? 'tid-stigende'
      : tilstand.sortering;

  const sorterte = sorterEventer(eventer, effektivSortering);

  /* Vis med daggruppering for tidssortering, flat liste for pris/avstand */
  let dagGrupper;
  if (erTidsSortering(effektivSortering)) {
    dagGrupper = grupperEtterDag(sorterte);
  } else {
    /* Ingen dagoverskrift — label: null signaliserer til feed.js at den skal hoppes over */
    dagGrupper = [{ nokkel: 'global', label: null, eventer: sorterte }];
  }

  visEventer(dagGrupper, tilstand.visLagret);
  oppdaterTreffLinje(sorterte.length);
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
        tilstand.aktivFiltre.naerhet = !tilstand.aktivFiltre.naerhet;
        chip.classList.toggle('aktiv', tilstand.aktivFiltre.naerhet);
        chip.setAttribute('aria-pressed', String(tilstand.aktivFiltre.naerhet));

      } else if (type === 'kategori') {
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
        const erAktivNå = tilstand.aktivFiltre[type] === verdi;

        document.querySelectorAll(`[data-filter="${type}"]`).forEach((c) => {
          c.classList.remove('aktiv');
          c.setAttribute('aria-pressed', 'false');
        });

        if (erAktivNå) {
          tilstand.aktivFiltre[type] = null;
        } else {
          tilstand.aktivFiltre[type] = verdi;
          chip.classList.add('aktiv');
          chip.setAttribute('aria-pressed', 'true');
        }
      }

      oppdaterNullstillKnapp();
      oppdaterFeed();

      /* Sporing: track kun når filter aktiveres, ikke ved deaktivering */
      if (chip.classList.contains('aktiv')) {
        trackEvent('filter_valgt', { type, verdi: chip.dataset.verdi ?? type });
      }
    });
  });
}

function oppdaterNullstillKnapp() {
  const harAktive =
    tilstand.aktivFiltre.kategori.length > 0 ||
    tilstand.aktivFiltre.tid   !== null  ||
    tilstand.aktivFiltre.pris  !== null;

  document.getElementById('nullstill-knapp').classList.toggle('skjult', !harAktive);
}

function initNullstillKnapp() {
  document.getElementById('nullstill-knapp').addEventListener('click', () => {
    tilstand.aktivFiltre = { kategori: [], tid: null, pris: null, naerhet: false };

    document.querySelectorAll('.chip').forEach((c) => {
      c.classList.remove('aktiv');
      if (c.dataset.filter === 'tid' || c.dataset.filter === 'pris') {
        c.setAttribute('aria-pressed', 'false');
      }
    });

    oppdaterNullstillKnapp();
    oppdaterFeed();
  });
}


/* ========================
   POSISJON OG AVSTAND
   ======================== */

/**
 * Delt posisjonsflyt — brukes av både «Vis avstand»-knappen og sorteringsdropdown.
 * Bruker cachet posisjon fra tilstand dersom tilgjengelig (brukeren trenger ikke godkjenne igjen).
 * Returnerer posisjon ved suksess, null ved avslag/feil.
 */
async function hentEllerBrukPosisjon() {
  if (tilstand.posisjonLastes) return null;
  if (tilstand.brukerPosisjon) return tilstand.brukerPosisjon;

  tilstand.posisjonLastes = true;
  const pos = await hentPosisjon();
  tilstand.posisjonLastes = false;

  return pos;
}

function initVisAvstandKnapp() {
  const knapp    = document.getElementById('vis-avstand');
  const statusEl = document.getElementById('posisjon-status');

  knapp.addEventListener('click', async () => {
    if (tilstand.visAvstand) {
      /* Slå av avstandsvisning */
      tilstand.visAvstand = false;
      knapp.setAttribute('aria-pressed', 'false');
      knapp.classList.remove('aktiv');
      skjulStatus(statusEl);

      /* Bytt fra avstandssortering til tidssortering */
      if (erAvstandsSortering(tilstand.sortering)) {
        tilstand.sortering = 'tid-stigende';
        document.getElementById('sortering').value = 'tid-stigende';
      }

      oppdaterFeed();
      return;
    }

    /* Slå på — be om posisjon (eller bruk cachet) */
    if (tilstand.posisjonLastes) return;

    knapp.disabled = true;
    visStatus(statusEl, 'Henter posisjon …');

    const pos = await hentEllerBrukPosisjon();

    knapp.disabled = false;

    if (!pos) {
      visStatus(statusEl, 'Vi trenger posisjonen din for å vise avstand.', true);
      return;
    }

    tilstand.brukerPosisjon = pos;
    tilstand.visAvstand     = true;
    knapp.setAttribute('aria-pressed', 'true');
    knapp.classList.add('aktiv');
    skjulStatus(statusEl);
    trackEvent('avstand_aktivert');
    oppdaterFeed();
  });
}

function initSortering() {
  const select   = document.getElementById('sortering');
  const statusEl = document.getElementById('posisjon-status');

  select.addEventListener('change', async () => {
    const nyVerdi      = select.value;
    const forrigeVerdi = tilstand.sortering;

    if (erAvstandsSortering(nyVerdi) && !tilstand.visAvstand) {
      /* Brukeren vil sortere etter avstand — be om posisjon */
      if (tilstand.posisjonLastes) {
        select.value = forrigeVerdi;
        return;
      }

      visStatus(statusEl, 'Henter posisjon …');

      const pos = await hentEllerBrukPosisjon();

      if (!pos) {
        visStatus(statusEl, 'Vi trenger posisjonen din for å vise avstand.', true);
        select.value = forrigeVerdi; /* reverter til forrige gyldige verdi */
        return;
      }

      tilstand.brukerPosisjon = pos;
      tilstand.visAvstand     = true;

      const visAvstandKnapp = document.getElementById('vis-avstand');
      visAvstandKnapp.setAttribute('aria-pressed', 'true');
      visAvstandKnapp.classList.add('aktiv');
      skjulStatus(statusEl);
    }

    tilstand.sortering = nyVerdi;
    oppdaterFeed();
  });
}

function visStatus(el, tekst, erFeil = false) {
  el.textContent = tekst;
  el.classList.remove('skjult');
  el.classList.toggle('posisjon-feil', erFeil);
  el.classList.toggle('posisjon-info', !erFeil);
}

function skjulStatus(el) {
  el.textContent = '';
  el.classList.add('skjult');
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
    if (lagret) trackEvent('event_lagret', { id });
    if (tilstand.visLagret) oppdaterFeed();
  });
}


/* ========================
   SAMTYKKE OG SPORING
   ======================== */

function initSamtykke() {
  if (localStorage.getItem('paaby-samtykke') === 'ja') {
    aktiverSporing();
    return;
  }

  const stripe = document.getElementById('samtykke-stripe');
  if (!stripe) return;
  stripe.classList.remove('skjult');

  document.getElementById('samtykke-ok').addEventListener('click', () => {
    localStorage.setItem('paaby-samtykke', 'ja');
    stripe.classList.add('skjult');
    aktiverSporing();
  }, { once: true });
}


/* ========================
   HASH-RUTING
   ======================== */

function håndterHash() {
  const match = window.location.hash.match(/^#event\/(.+)$/);
  if (!match) return;

  let id;
  try {
    id = decodeURIComponent(match[1]);
  } catch {
    return;
  }

  const event = tilstand.alleEventer.find((e) => e.id === id);
  if (event) åpneModal(event);
}

function initHashRuting() {
  window.addEventListener('hashchange', () => {
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
  initVisAvstandKnapp();
  initSortering();
  initSamtykke();

  try {
    tilstand.alleEventer = await hentEventer();
    oppdaterFeed();
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
