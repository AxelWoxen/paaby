/* modal.js — presentasjonslaget for detaljvisning. */

import { erLagret, veksleLagret }                                       from '../application/lagret.js';
import { formaterPrisTekst, formaterTidKort, formaterAvstand, kapitaliser } from '../application/formatering.js';

let åpenEvent = null;


/* ========================
   ÅPNE / LUKKE
   ======================== */

export function åpneModal(event) {
  åpenEvent = event;

  const modal   = document.getElementById('modal');
  const innhold = document.getElementById('modal-innhold');

  innhold.innerHTML = lagModalInnhold(event);

  modal.classList.add('aktiv');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-aapen');

  document.getElementById('modal-lukk').focus();

  leggTilModalLyttere(event);
}

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

function lagModalInnhold(event) {
  const lagret          = erLagret(event.id);
  const harKoordinater  = event.lat != null && event.lng != null;
  const kartLenke       = harKoordinater
    ? `https://www.google.com/maps/search/?api=1&query=${event.lat},${event.lng}`
    : null;

  const stedHtml = [event.sted, event.adresse].filter(Boolean).join(' · ');

  const avstandHtml = event._avstand != null
    ? `<div class="faktarad-felt">
         <span class="faktarad-etikett">Avstand</span>
         <span class="faktarad-verdi">${formaterAvstand(event._avstand)}</span>
       </div>`
    : '';

  const kartKnappHtml = kartLenke
    ? `<a href="${kartLenke}" target="_blank" rel="noopener noreferrer"
          class="knapp knapp-sekundaer">vis på kart</a>`
    : '';

  const lenkeKnappHtml = event.lenke
    ? `<a href="${event.lenke}" target="_blank" rel="noopener noreferrer"
          class="knapp knapp-primaer">mer info / billett</a>`
    : '';

  const bildeHtml = event.bilde
    ? `<img src="${event.bilde}" alt="${event.tittel}" class="modal-bilde" />`
    : '';

  return `
    ${bildeHtml}

    <div class="modal-body">
      <span class="modal-kategori kategori-${event.kategori}">${event.kategori}</span>
      <h2 class="modal-tittel" id="modal-overskrift">${event.tittel}</h2>
      <p class="modal-sted">${stedHtml}</p>

      <div class="modal-faktarad">
        <div class="faktarad-felt">
          <span class="faktarad-etikett">Type</span>
          <span class="faktarad-verdi">${kapitaliser(event.kategori)}</span>
        </div>
        <div class="faktarad-felt">
          <span class="faktarad-etikett">Tid</span>
          <span class="faktarad-verdi">${formaterTidKort(event.start)}</span>
        </div>
        <div class="faktarad-felt">
          <span class="faktarad-etikett">Pris</span>
          <span class="faktarad-verdi ${(event.pris ?? 0) === 0 ? 'pris-gratis' : ''}">${formaterPrisTekst(event.pris)}</span>
        </div>
        ${avstandHtml}
      </div>

      ${event.beskrivelse ? `<p class="modal-beskrivelse">${event.beskrivelse}</p>` : ''}

      ${(kartKnappHtml || lenkeKnappHtml) ? `
        <div class="modal-handlinger">
          ${kartKnappHtml}
          ${lenkeKnappHtml}
        </div>
      ` : ''}

      <div class="modal-bunn">
        <button class="knapp-ghost modal-hjerte" aria-pressed="${lagret}">
          ${lagret ? '♥ lagret' : '♡ lagre'}
        </button>
        <button class="knapp-ghost del-knapp">del</button>
      </div>
    </div>
  `;
}

function leggTilModalLyttere(event) {
  document.querySelector('.modal-hjerte').addEventListener('click', (e) => {
    const erNåLagret = veksleLagret(event.id);
    e.currentTarget.textContent = erNåLagret ? '♥ lagret' : '♡ lagre';
    e.currentTarget.setAttribute('aria-pressed', String(erNåLagret));
  });

  document.querySelector('.del-knapp').addEventListener('click', (e) => {
    delEvent(event, e.currentTarget);
  });
}

async function delEvent(event, knapp) {
  const tittel = `${event.tittel} @ ${event.sted}`;

  if (navigator.share) {
    try {
      await navigator.share({ title: event.tittel, text: tittel, url: event.lenke });
    } catch {
      /* Brukeren avbrøt — ikke vis noen feil */
    }
    return;
  }

  try {
    await navigator.clipboard.writeText(event.lenke ?? window.location.href);
    knapp.textContent = 'lenke kopiert!';
    setTimeout(() => { knapp.textContent = 'del'; }, 2000);
  } catch {
    window.prompt('Kopier denne lenken:', event.lenke ?? window.location.href);
  }
}


/* ========================
   INITIALISERING
   ======================== */

export function initModal() {
  document.getElementById('modal-lukk').addEventListener('click', lukkModal);

  document.getElementById('modal').addEventListener('click', (hendelse) => {
    if (hendelse.target === hendelse.currentTarget) lukkModal();
  });

  document.addEventListener('keydown', (hendelse) => {
    if (hendelse.key === 'Escape' && åpenEvent) lukkModal();
  });
}
