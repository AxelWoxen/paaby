/* modal.js — presentasjonslaget for detaljvisning.
   Eneste ansvar: åpne/lukke modal og rendre event-detaljer.
   Importerer kun fra application-laget — aldri fra network. */

import { erLagret, veksleLagret } from '../application/lagret.js';

/* Holder styr på hvilket event som er åpent — brukes av Escape-lytteren */
let åpenEvent = null;


/* ========================
   ÅPNE / LUKKE
   ======================== */

/**
 * Åpner modalen med detaljer for gitt event.
 * @param {Object} event - Event-objektet fra events.json
 */
export function åpneModal(event) {
  åpenEvent = event;

  const modal   = document.getElementById('modal');
  const innhold = document.getElementById('modal-innhold');

  /* Fyll inn HTML før vi viser modalen */
  innhold.innerHTML = lagModalInnhold(event);

  modal.classList.add('aktiv');
  modal.setAttribute('aria-hidden', 'false');
  /* Forhindre scrolling av siden i bakgrunnen */
  document.body.classList.add('modal-aapen');

  /* Flytt fokus til lukk-knappen — viktig for tastatur- og skjermleser-brukere */
  document.getElementById('modal-lukk').focus();

  /* Sett opp knappene inne i modal-innholdet */
  leggTilModalLyttere(event);
}

/**
 * Lukker modalen og rydder opp tilstand.
 */
export function lukkModal() {
  const modal = document.getElementById('modal');

  modal.classList.remove('aktiv');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-aapen');
  åpenEvent = null;
}


/* ========================
   INNHOLD
   ======================== */

/**
 * Bygger HTML for modal-innholdet basert på et event-objekt.
 */
function lagModalInnhold(event) {
  const lagret = erLagret(event.id);

  /* Google Maps-lenke som åpner kart med pinne på koordinatene */
  const kartLenke = `https://www.google.com/maps/search/?api=1&query=${event.lat},${event.lng}`;

  return `
    <img src="${event.bilde}" alt="${event.tittel}" class="modal-bilde" />

    <div class="modal-body">
      <span class="modal-kategori kategori-${event.kategori}">${event.kategori}</span>
      <h2 class="modal-tittel" id="modal-overskrift">${event.tittel}</h2>
      <p class="modal-sted">${event.sted} · ${event.adresse}</p>
      <p class="modal-beskrivelse">${event.beskrivelse}</p>

      <div class="modal-handlinger">
        <a
          href="${kartLenke}"
          target="_blank"
          rel="noopener noreferrer"
          class="knapp knapp-sekundaer"
        >vis på kart</a>

        <a
          href="${event.lenke}"
          target="_blank"
          rel="noopener noreferrer"
          class="knapp knapp-primaer"
        >mer info / billett</a>
      </div>

      <div class="modal-bunn">
        <button class="knapp-ghost modal-hjerte" aria-pressed="${lagret}">
          ${lagret ? '♥ lagret' : '♡ lagre'}
        </button>
        <button class="knapp-ghost del-knapp">
          del
        </button>
      </div>
    </div>
  `;
}

/**
 * Legger til klikk-lyttere på knappene inne i modal-innholdet.
 * Kalles etter at innholdet er satt inn i DOM-en.
 */
function leggTilModalLyttere(event) {
  /* Hjerte-knapp i modal */
  document.querySelector('.modal-hjerte').addEventListener('click', (e) => {
    const erNåLagret = veksleLagret(event.id);
    e.currentTarget.textContent = erNåLagret ? '♥ lagret' : '♡ lagre';
    e.currentTarget.setAttribute('aria-pressed', String(erNåLagret));
  });

  /* Del-knapp */
  document.querySelector('.del-knapp').addEventListener('click', (e) => {
    delEvent(event, e.currentTarget);
  });
}

/**
 * Deler eventet:
 * 1. Web Share API på mobil (native share-ark)
 * 2. Fallback: kopier lenken til utklippstavlen
 */
async function delEvent(event, knapp) {
  const tittel = `${event.tittel} @ ${event.sted}`;

  if (navigator.share) {
    try {
      await navigator.share({
        title: event.tittel,
        text: tittel,
        url: event.lenke,
      });
    } catch {
      /* Brukeren avbrøt — ikke vis noen feil */
    }
    return;
  }

  /* Fallback: kopier lenken og gi visuell bekreftelse */
  try {
    await navigator.clipboard.writeText(event.lenke);
    knapp.textContent = 'lenke kopiert!';
    /* Gjenopprett original tekst etter 2 sekunder */
    setTimeout(() => { knapp.textContent = 'del'; }, 2000);
  } catch {
    /* Clipboard API avslått — siste utvei */
    window.prompt('Kopier denne lenken:', event.lenke);
  }
}


/* ========================
   INITIALISERING
   ======================== */

/**
 * Setter opp lyttere som styrer lukking av modal.
 * Kalles én gang av main.js ved oppstart.
 */
export function initModal() {
  /* Lukk-knapp (×) */
  document.getElementById('modal-lukk').addEventListener('click', lukkModal);

  /* Klikk på den mørke bakgrunnen */
  document.getElementById('modal').addEventListener('click', (hendelse) => {
    /* hendelse.target er elementet som faktisk ble klikket.
       Vi vil bare lukke hvis man klikket på selve overlay-en, ikke innholdet. */
    if (hendelse.target === hendelse.currentTarget) lukkModal();
  });

  /* Escape-tasten */
  document.addEventListener('keydown', (hendelse) => {
    if (hendelse.key === 'Escape' && åpenEvent) lukkModal();
  });
}
