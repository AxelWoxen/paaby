/* main.js — appens inngangspunkt og orkestrator.
   Eneste ansvar: koordinere de tre lagene.
   Importerer fra alle lag, men lagene importerer IKKE fra hverandre
   (unntatt presentation → application, som er tillatt). */

import { hentEventer }                    from './network/events-api.js';
import { filtrerEventer }                  from './application/filtre.js';
import { hentPosisjon, kalkulerAvstand }   from './application/posisjon.js';
import { hentLagredeIder }                 from './application/lagret.js';
import { visEventer }                      from './presentation/feed.js';
import { initModal }                       from './presentation/modal.js';
/* Kart er valgfritt — fjern disse to linjene for å skru av kartet */
import { initKart, visKart, skjulKart }    from './presentation/kart.js';


/* ========================
   GLOBAL TILSTAND
   Én plass der appens data bor. main.js eier denne og sender den videre.
   ======================== */

const tilstand = {
  alleEventer: [],   /* Alle eventer lastet fra JSON, uendret */

  aktivFiltre: {
    kategori: null,  /* "musikk" | "mat" | "klubb" | null */
    tid: null,       /* "i-kveld" | "i-helga" | null */
    pris: null,      /* "gratis" | "under-200" | "over-200" | null */
    naerhet: false,  /* boolean */
  },

  brukerPosisjon: null,   /* { lat, lng } eller null hvis posisjon er avslått */
  visLagret: false,       /* Er vi i "lagret"-visning? */
  visKartModus: false,    /* Er kartet åpent? */
};


/* ========================
   OPPDATER FEED
   ======================== */

/**
 * Kalkulerer hvilke eventer som skal vises og sender dem til feed.js.
 * Kalles hver gang noe endres: filter, posisjon, eller visningsmode.
 */
function oppdaterFeed() {
  let eventer;

  if (tilstand.visLagret) {
    /* Lagret-visning: vis kun eventer brukeren har hjertet */
    const lagredeIder = hentLagredeIder();
    eventer = tilstand.alleEventer.filter((e) => lagredeIder.includes(e.id));
  } else {
    /* Normal visning: kjør gjennom filtreringslogikken */
    eventer = filtrerEventer(
      tilstand.alleEventer,
      tilstand.aktivFiltre,
      tilstand.brukerPosisjon
    );
  }

  visEventer(eventer);
  oppdaterTreffLinje(eventer.length);
}

/**
 * Oppdaterer treff-telleren og tilbake-knappen øverst.
 */
function oppdaterTreffLinje(antall) {
  const teller       = document.getElementById('treff-teller');
  const tilbakeKnapp = document.getElementById('vis-alle');

  if (tilstand.visLagret) {
    teller.textContent = antall === 0 ? 'ingenting lagret ennå' : `${antall} lagret`;
    tilbakeKnapp.classList.remove('skjult');
  } else {
    teller.textContent = `${antall} steder`;
    tilbakeKnapp.classList.add('skjult');
  }
}


/* ========================
   FILTRE
   ======================== */

/**
 * Setter opp klikk-lyttere på alle filter-chips.
 * Chips bruker data-filter og data-verdi for å fortelle hvilken type
 * filter de representerer.
 */
function initFiltre() {
  document.querySelectorAll('[data-filter]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const type  = chip.dataset.filter;
      const verdi = chip.dataset.verdi;

      if (type === 'naerhet') {
        /* Nærhets-filter er en on/off-toggle (ingen verdi) */
        tilstand.aktivFiltre.naerhet = !tilstand.aktivFiltre.naerhet;
        chip.classList.toggle('aktiv', tilstand.aktivFiltre.naerhet);
      } else {
        if (tilstand.aktivFiltre[type] === verdi) {
          /* Klikk på allerede aktiv chip = slå av filteret */
          tilstand.aktivFiltre[type] = null;
          chip.classList.remove('aktiv');
        } else {
          /* Slå på dette filteret og slå av eventuelle andre i samme gruppe */
          document
            .querySelectorAll(`[data-filter="${type}"]`)
            .forEach((s) => s.classList.remove('aktiv'));

          tilstand.aktivFiltre[type] = verdi;
          chip.classList.add('aktiv');
        }
      }

      oppdaterFeed();
    });
  });
}


/* ========================
   LAGRET-VISNING
   ======================== */

/**
 * Setter opp lagret-knappen (♡) i headeren og tilbake-knappen.
 */
function initLagretKnapp() {
  const visLagretKnapp = document.getElementById('vis-lagret');
  const visAlleKnapp   = document.getElementById('vis-alle');

  visLagretKnapp.addEventListener('click', () => {
    tilstand.visLagret = true;
    visLagretKnapp.classList.add('aktiv');
    oppdaterFeed();
  });

  visAlleKnapp.addEventListener('click', () => {
    tilstand.visLagret = false;
    visLagretKnapp.classList.remove('aktiv');
    oppdaterFeed();
  });
}


/* ========================
   KART (valgfritt)
   ======================== */

/**
 * Setter opp kart-knappen. Fjern denne funksjonen og kallet til den
 * i startApp() for å skru av kart-funksjonaliteten.
 */
function initKartKnapp() {
  const kartKnapp    = document.getElementById('vis-kart');
  const lukkKartKnapp = document.getElementById('lukk-kart');

  if (!kartKnapp) return; /* Knappen finnes ikke — ingenting å gjøre */

  kartKnapp.addEventListener('click', () => {
    tilstand.visKartModus = true;
    visKart();
  });

  if (lukkKartKnapp) {
    lukkKartKnapp.addEventListener('click', () => {
      tilstand.visKartModus = false;
      skjulKart();
    });
  }
}


/* ========================
   OPPSTART
   ======================== */

/**
 * Starter appen. Async fordi vi venter på data fra nettverket.
 */
async function startApp() {
  /* Sett opp alt som ikke trenger data */
  initModal();
  initFiltre();
  initLagretKnapp();
  initKartKnapp();

  try {
    /* Hent eventer og vis dem */
    tilstand.alleEventer = await hentEventer();
    oppdaterFeed();

    /* Initialiser kart med eventene (gjør ingenting hvis Leaflet ikke er lastet) */
    initKart(tilstand.alleEventer);

  } catch (feil) {
    /* Noe gikk galt med datahentingen — vis feilmelding i feeden */
    document.getElementById('feed').innerHTML =
      '<p class="tom-feed">klarte ikke laste eventer. er du koblet til internett?</p>';
    console.error('Påby: feil ved henting av eventer:', feil);
    return; /* Avslutt — ingen vits i å hente posisjon uten eventer */
  }

  /* Hent posisjon i bakgrunnen.
     Vi venter IKKE på dette — appen er allerede synlig og brukbar.
     Når posisjon ankommer oppdaterer vi lydløst avstandene. */
  hentPosisjon().then((posisjon) => {
    if (!posisjon) return; /* Avslått eller ikke støttet — ingenting å gjøre */

    tilstand.brukerPosisjon = posisjon;

    /* Legg _avstand på hvert event som et ekstra felt (prefix _ = internt felt) */
    tilstand.alleEventer = tilstand.alleEventer.map((event) => ({
      ...event,
      _avstand: kalkulerAvstand(posisjon, { lat: event.lat, lng: event.lng }),
    }));

    /* Oppdater feeden slik at avstandene vises */
    oppdaterFeed();
  });
}

/* Kjør appen — ingen DOMContentLoaded nødvendig fordi
   script-taggen i index.html har type="module", og modules
   kjøres alltid etter at HTML er ferdig parset */
startApp();
