/* feed.js — presentasjonslaget for kortlisten.
   Eneste ansvar: ta en liste eventer og tegne dem som HTML-kort i DOM-en.
   Importerer fra application-laget for lagret-status, men rører ikke nettverket. */

import { erLagret, veksleLagret } from '../application/lagret.js';

/* åpneModal importeres her for å unngå at main.js må koordinere klikk.
   Presentasjonslaget vet at et kortklikk skal åpne modal — det er en UI-regel. */
import { åpneModal } from './modal.js';


/* ========================
   HJELPEFUNKSJONER — formaterer data til lesbar tekst
   ======================== */

/**
 * Konverterer et tall (kr) til lesbar prisstreng.
 * 0 kr → HTML-span med "Gratis" i lime-farge.
 */
function formaterPris(pris) {
  if (pris === 0) return '<span class="pris-gratis">Gratis</span>';
  return `${pris} kr`;
}

/**
 * Konverterer en ISO-datostreng til "Fre 26. jun · 23:00".
 */
function formaterTid(isoStreng) {
  const dato = new Date(isoStreng);
  const dager   = ['Søn', 'Man', 'Tirs', 'Ons', 'Tor', 'Fre', 'Lør'];
  const måneder = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];

  const dagNavn  = dager[dato.getDay()];
  const datoDag  = dato.getDate();
  const måned    = måneder[dato.getMonth()];
  /* padStart(2, '0') sørger for at "9" blir "09" */
  const timer    = String(dato.getHours()).padStart(2, '0');
  const minutter = String(dato.getMinutes()).padStart(2, '0');

  return `${dagNavn} ${datoDag}. ${måned} · ${timer}:${minutter}`;
}

/**
 * Konverterer avstand i km til lesbar streng.
 * Under 1 km: vis i meter. Over: én desimal i km.
 * Returnerer tom streng hvis avstand ikke er kjent.
 */
function formaterAvstand(avstand) {
  if (avstand == null) return '';
  if (avstand < 1) return `${Math.round(avstand * 1000)} m`;
  return `${avstand.toFixed(1)} km`;
}


/* ========================
   KORTET
   ======================== */

/**
 * Bygger HTML-strengen for ett event-kort.
 * Vi bruker template literals (backtick-strenger) for å flette inn data.
 *
 * @param {Object} event - Et event-objekt fra events.json (+ evt. _avstand)
 * @returns {string} HTML-streng
 */
function lagKort(event) {
  const lagret      = erLagret(event.id);
  const avstandTekst = event._avstand != null
    ? `<span class="avstand">${formaterAvstand(event._avstand)}</span>`
    : '';

  /* data-id lagres på elementet så vi kan finne riktig event ved klikk */
  return `
    <article class="kort" data-id="${event.id}" role="button" tabindex="0"
             aria-label="Åpne detaljer for ${event.tittel}">

      <div class="kort-bilde-wrapper">
        <img
          src="${event.bilde}"
          alt="${event.tittel}"
          class="kort-bilde"
          loading="lazy"
        />
        <span class="kort-kategori kategori-${event.kategori}">${event.kategori}</span>

        <button
          class="hjerte-knapp ${lagret ? 'lagret' : ''}"
          data-id="${event.id}"
          aria-label="${lagret ? 'Fjern fra lagret' : 'Lagre event'}"
          aria-pressed="${lagret}"
        >${lagret ? '♥' : '♡'}</button>
      </div>

      <div class="kort-innhold">
        <h2 class="kort-tittel">${event.tittel}</h2>
        <div class="kort-meta">
          <span class="sted">${event.sted}</span>
          ${avstandTekst}
        </div>
        <div class="kort-footer">
          <span class="tid">${formaterTid(event.start)}</span>
          <span class="pris">${formaterPris(event.pris)}</span>
        </div>
      </div>

    </article>
  `;
}


/* ========================
   VISNING
   ======================== */

/**
 * Erstatter innholdet i #feed med kort for de gitte eventene.
 * Kalles av main.js hver gang filtre endres eller posisjon oppdateres.
 *
 * @param {Array} eventer - Filtrert liste med eventer som skal vises
 */
export function visEventer(eventer) {
  const feed = document.getElementById('feed');

  if (eventer.length === 0) {
    feed.innerHTML = '<p class="tom-feed">ingenting matchet — løsne på filtrene, så finner vi noe.</p>';
    return;
  }

  /* Bygg all HTML på én gang og sett den inn. Dette er raskere enn å
     legge til ett element om gangen fordi DOM-en bare tegnes opp én gang. */
  feed.innerHTML = eventer.map(lagKort).join('');

  /* Legg til event-lyttere etter at HTML-en er i DOM-en */
  leggTilKortLyttere(feed, eventer);
}

/**
 * Legger klikk-lyttere på kort og hjerte-knapper.
 * Skilt ut i egen funksjon for å holde visEventer ryddig.
 */
function leggTilKortLyttere(feed, eventer) {
  /* Kortene er klikkbare som helhet */
  feed.querySelectorAll('.kort').forEach((kort) => {
    kort.addEventListener('click', (hendelse) => {
      /* Stopp klikk på hjerte-knappen fra å boble opp og åpne modalen */
      if (hendelse.target.closest('.hjerte-knapp')) return;

      const id = kort.dataset.id;
      const event = eventer.find((e) => e.id === id);
      åpneModal(event);
    });

    /* Tastatur-tilgjengelighet: Enter og Space åpner kortet */
    kort.addEventListener('keydown', (hendelse) => {
      if (hendelse.key === 'Enter' || hendelse.key === ' ') {
        hendelse.preventDefault();
        kort.click();
      }
    });
  });

  /* Hjerte-knapper: oppdater kun ikonet i stedet for å re-rendre hele feeden */
  feed.querySelectorAll('.hjerte-knapp').forEach((knapp) => {
    knapp.addEventListener('click', (hendelse) => {
      /* Stopp klikket her — vi vil ikke at kortets klikk-lytter også skal kjøre */
      hendelse.stopPropagation();

      const id = knapp.dataset.id;
      const erNåLagret = veksleLagret(id);

      /* Oppdater knappen direkte uten å laste feeden på nytt */
      knapp.textContent = erNåLagret ? '♥' : '♡';
      knapp.classList.toggle('lagret', erNåLagret);
      knapp.setAttribute('aria-pressed', String(erNåLagret));
      knapp.setAttribute('aria-label', erNåLagret ? 'Fjern fra lagret' : 'Lagre event');
    });
  });
}
