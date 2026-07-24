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
import { velgUtvalg, visForside, initSeAlt }      from './presentation/forside.js';
import { utvidGjentakende }                        from './application/gjentas.js';
import { visFølgerVisning }                        from './presentation/følger.js';
import { ukeMandag, ukeVindu,
         filtrerTilUke, ukeLabel }                 from './application/uke.js';


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
  visFølger:      false,

  ukeOffset:      0,  /* 0 = denne uka, 1 = neste uke osv. — kun i standardvisning */
};


/* ========================
   OPPDATER FEED
   ======================== */

function oppdaterFeed() {
  if (tilstand.visFølger) {
    visFølgerVisning(tilstand.alleEventer, oppdaterFeed);
    oppdaterTreffLinje(0);
    return;
  }

  let eventer;
  let ukeTom = false;

  if (tilstand.visLagret) {
    const lagredeIder = hentLagredeIder(tilstand.alleEventer.map((e) => e.id));
    eventer = tilstand.alleEventer.filter((e) => lagredeIder.includes(e.id));
    eventer = skjulPasserte(eventer);
  } else {
    const aktive = skjulPasserte(tilstand.alleEventer);

    const mandag        = ukeMandag();
    const { fra, til }   = ukeVindu(mandag, tilstand.ukeOffset);
    const ukensEventer   = filtrerTilUke(aktive, fra, til);

    ukeTom  = ukensEventer.length === 0;
    eventer = filtrerEventer(ukensEventer, tilstand.aktivFiltre, tilstand.brukerPosisjon);

    oppdaterUkeNav(mandag);
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

  let tomMelding;
  if (tilstand.visLagret) {
    tomMelding = 'Ingenting lagret enda — trykk hjertet på det du vil på.';
  } else if (ukeTom) {
    tomMelding = 'Ingenting lagt inn her ennå – vi fyller på.';
  } else {
    tomMelding = 'Ingenting matchet — løsne på filtrene, så finner vi noe.';
  }

  visEventer(dagGrupper, tomMelding);
  oppdaterTreffLinje(sorterte.length);
}

function oppdaterTreffLinje(antall) {
  const teller        = document.getElementById('treff-teller');
  const tilbakeKnapp  = document.getElementById('vis-alle');
  const lagretInfo    = document.getElementById('lagret-info');
  const sorteringDiv  = document.querySelector('.sortering-kontroll');
  const sidestolpe    = document.querySelector('.sidestolpe');
  const ukeNav        = document.getElementById('uke-nav');

  if (tilstand.visFølger) {
    teller.textContent = 'Steder du følger';
    tilbakeKnapp.classList.remove('skjult');
    lagretInfo?.classList.add('skjult');
    sorteringDiv?.classList.add('skjult');
    sidestolpe?.classList.add('skjult');
    ukeNav?.classList.add('skjult');
  } else if (tilstand.visLagret) {
    teller.textContent = antall === 0 ? 'ingenting lagret' : `${antall} forslag lagret`;
    tilbakeKnapp.classList.remove('skjult');
    lagretInfo?.classList.remove('skjult');
    sorteringDiv?.classList.remove('skjult');
    sidestolpe?.classList.remove('skjult');
    ukeNav?.classList.add('skjult');
  } else {
    teller.textContent = `${antall} forslag`;
    tilbakeKnapp.classList.add('skjult');
    lagretInfo?.classList.add('skjult');
    sorteringDiv?.classList.remove('skjult');
    sidestolpe?.classList.remove('skjult');
    ukeNav?.classList.remove('skjult');
  }

  oppdaterBunnNavAktiv();
}

/* ========================
   UKE-NAVIGASJON
   ======================== */

function oppdaterUkeNav(mandagDenneUka) {
  document.getElementById('uke-label').textContent = ukeLabel(mandagDenneUka, tilstand.ukeOffset);
  document.getElementById('uke-forrige').classList.toggle('skjult', tilstand.ukeOffset === 0);
}

function initUkeNav() {
  document.getElementById('uke-forrige').addEventListener('click', () => {
    if (tilstand.ukeOffset === 0) return;
    tilstand.ukeOffset -= 1;
    oppdaterFeed();
  });

  document.getElementById('uke-neste').addEventListener('click', () => {
    tilstand.ukeOffset += 1;
    oppdaterFeed();
  });
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
  try {
    return await hentPosisjon();
  } finally {
    /* try/finally: garanterer at låsen slippes selv om hentPosisjon() skulle
       kaste en feil — uten dette kan ALLE senere klikk på «Vis avstand» bli
       stille avvist for alltid (se posisjonLastes-sjekken under). */
    tilstand.posisjonLastes = false;
  }
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
    if (tilstand.posisjonLastes) {
      /* Et tidligere klikk laster fortsatt — gi tilbakemelding i stedet for
         å avvise klikket helt tyst (se KRAV: ingen tilstand skal være taus). */
      visStatus(statusEl, 'Henter posisjon …');
      return;
    }

    knapp.disabled = true;
    visStatus(statusEl, 'Henter posisjon …');

    let pos;
    try {
      pos = await hentEllerBrukPosisjon();
    } finally {
      /* try/finally: knappen skal aldri bli stående deaktivert for alltid,
         selv om noe uventet skulle kaste en feil over. */
      knapp.disabled = false;
    }

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
        /* Gi tilbakemelding i stedet for å reversere helt tyst. */
        visStatus(statusEl, 'Henter posisjon …');
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

function nullstillModusKnapper() {
  document.getElementById('vis-lagret')?.classList.remove('aktiv');
  document.getElementById('vis-lagret')?.setAttribute('aria-pressed', 'false');
  document.getElementById('vis-følger')?.classList.remove('aktiv');
  document.getElementById('vis-følger')?.setAttribute('aria-pressed', 'false');
}

function scrollTilHoveddel() {
  document.getElementById('hoveddel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function initLagretKnapp() {
  const visLagretKnapp = document.getElementById('vis-lagret');
  const visAlleKnapp   = document.getElementById('vis-alle');

  visLagretKnapp.addEventListener('click', () => {
    if (tilstand.visLagret) {
      nullstillModusKnapper();
      tilstand.visLagret = false;
      tilstand.visFølger = false;
      tilstand.ukeOffset = 0;
      oppdaterFeed();
      scrollTilHoveddel();
      return;
    }
    nullstillModusKnapper();
    tilstand.visLagret = true;
    tilstand.visFølger = false;
    visLagretKnapp.classList.add('aktiv');
    visLagretKnapp.setAttribute('aria-pressed', 'true');
    oppdaterFeed();
    scrollTilHoveddel();
  });

  visAlleKnapp.addEventListener('click', () => {
    nullstillModusKnapper();
    tilstand.visLagret = false;
    tilstand.visFølger = false;
    tilstand.ukeOffset = 0;
    oppdaterFeed();
  });
}

function initFølgerKnapp() {
  const visFølgerKnapp = document.getElementById('vis-følger');
  if (!visFølgerKnapp) return;

  visFølgerKnapp.addEventListener('click', () => {
    if (tilstand.visFølger) {
      nullstillModusKnapper();
      tilstand.visFølger = false;
      tilstand.visLagret = false;
      tilstand.ukeOffset = 0;
      oppdaterFeed();
      scrollTilHoveddel();
      return;
    }
    nullstillModusKnapper();
    tilstand.visFølger = true;
    tilstand.visLagret = false;
    visFølgerKnapp.classList.add('aktiv');
    visFølgerKnapp.setAttribute('aria-pressed', 'true');
    oppdaterFeed();
    scrollTilHoveddel();
  });
}

/* Lytter til lagret-endringer fra feed.js og modal.js */
function initLagretSync() {
  document.addEventListener('paaby:lagret-endret', ({ detail: { id, lagret } }) => {
    /* Oppdater modal-hjertet dersom modalen er åpen og viser dette arrangementet */
    const modalHjerte = document.querySelector('.modal-hjerte[data-id]');
    if (modalHjerte?.dataset.id === id) {
      modalHjerte.classList.toggle('lagret', lagret);
      const tekst = modalHjerte.querySelector('.modal-hjerte-tekst');
      if (tekst) tekst.textContent = lagret ? 'lagret' : 'lagre';
      modalHjerte.setAttribute('aria-pressed', String(lagret));
    }
    if (lagret) trackEvent('event_lagret', { id });
    if (tilstand.visLagret) oppdaterFeed();
  });
}


/* ========================
   BUNN-NAV (mobil, < 900px)
   Speiler tilstand fra vis-følger/vis-lagret ved å gjenbruke
   deres klikk-handlere — unngår duplisert tilstandslogikk.
   ======================== */

function bunnNavVisningsmodus() {
  const forsideEl = document.getElementById('forside');
  if (!forsideEl) return 'utforsk';
  /* Forside regnes som aktiv helt til bunnen av forside-seksjonen
     har passert forbi den sticky topbaren */
  return forsideEl.getBoundingClientRect().bottom > 100 ? 'forside' : 'utforsk';
}

function oppdaterBunnNavAktiv() {
  const knapper = {
    forside: document.getElementById('bunn-forside'),
    utforsk: document.getElementById('bunn-utforsk'),
    folger:  document.getElementById('bunn-folger'),
    lagret:  document.getElementById('bunn-lagret'),
  };
  if (!knapper.forside) return;

  let aktivNavn;
  if (tilstand.visLagret)      aktivNavn = 'lagret';
  else if (tilstand.visFølger) aktivNavn = 'folger';
  else                         aktivNavn = bunnNavVisningsmodus();

  Object.entries(knapper).forEach(([navn, el]) => {
    const erAktiv = navn === aktivNavn;
    el.classList.toggle('aktiv', erAktiv);
    el.setAttribute('aria-current', erAktiv ? 'page' : 'false');
  });
}

function initBunnNav() {
  const nav = document.querySelector('.bunn-nav');
  if (!nav) return;

  document.getElementById('bunn-forside').addEventListener('click', () => {
    document.getElementById('vis-alle')?.click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    oppdaterBunnNavAktiv();
  });

  document.getElementById('bunn-utforsk').addEventListener('click', () => {
    document.getElementById('vis-alle')?.click();
    scrollTilHoveddel();
    oppdaterBunnNavAktiv();
  });

  document.getElementById('bunn-folger').addEventListener('click', () => {
    document.getElementById('vis-følger')?.click();
  });

  document.getElementById('bunn-lagret').addEventListener('click', () => {
    document.getElementById('vis-lagret')?.click();
  });

  let scrollTikker = false;
  window.addEventListener('scroll', () => {
    if (scrollTikker) return;
    scrollTikker = true;
    requestAnimationFrame(() => {
      oppdaterBunnNavAktiv();
      scrollTikker = false;
    });
  }, { passive: true });

  oppdaterBunnNavAktiv();
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

  initFølgerKnapp();
  initSeAlt();
  initUkeNav();
  initBunnNav();

  try {
    tilstand.alleEventer = utvidGjentakende(await hentEventer());
    visForside(velgUtvalg(tilstand.alleEventer));
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
