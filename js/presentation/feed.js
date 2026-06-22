/* feed.js — presentasjonslaget for kortlisten.
   Rendrer grupperte eventer (per dag) som HTML i DOM-en. */

import { erLagret, veksleLagret }                       from '../application/lagret.js';
import { formaterPrisHtml, formaterTid, formaterAvstand } from '../application/formatering.js';
import { åpneModal }                                     from './modal.js';


/* ========================
   KORTET
   ======================== */

function lagKort(event) {
  const lagret       = erLagret(event.id);
  const avstandTekst = event._avstand != null
    ? `<span class="avstand">${formaterAvstand(event._avstand)}</span>`
    : '';

  const bildeHtml = event.bilde
    ? `<img src="${event.bilde}" alt="${event.tittel}" class="kort-bilde" loading="lazy" />`
    : `<div class="kort-bilde-placeholder"></div>`;

  return `
    <article class="kort" data-id="${event.id}" role="button" tabindex="0"
             aria-label="Åpne detaljer for ${event.tittel}">

      <div class="kort-bilde-wrapper">
        ${bildeHtml}
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
          <span class="pris">${formaterPrisHtml(event.pris)}</span>
        </div>
      </div>

    </article>
  `;
}


/* ========================
   VISNING
   ======================== */

/**
 * Erstatter innholdet i #feed med dag-seksjoner og kort.
 *
 * @param {Array}   dagGrupper    - [{ nokkel, label, eventer }]
 * @param {boolean} erLagretVisning
 */
export function visEventer(dagGrupper, erLagretVisning) {
  const feed = document.getElementById('feed');

  if (dagGrupper.length === 0) {
    feed.innerHTML = erLagretVisning
      ? '<p class="tom-feed">Ingenting lagret enda — trykk hjertet på det du vil på.</p>'
      : '<p class="tom-feed">Ingenting matchet — løsne på filtrene, så finner vi noe.</p>';
    return;
  }

  const alleEventer = dagGrupper.flatMap((g) => g.eventer);

  feed.innerHTML = dagGrupper.map((gruppe) => `
    <section class="dag-gruppe">
      <h2 class="dag-overskrift">${gruppe.label}</h2>
      <div class="dag-kort">
        ${gruppe.eventer.map(lagKort).join('')}
      </div>
    </section>
  `).join('');

  leggTilKortLyttere(feed, alleEventer);
}

function leggTilKortLyttere(feed, eventer) {
  feed.querySelectorAll('.kort').forEach((kort) => {
    kort.addEventListener('click', (hendelse) => {
      if (hendelse.target.closest('.hjerte-knapp')) return;

      const id    = kort.dataset.id;
      const event = eventer.find((e) => e.id === id);
      if (event) åpneModal(event);
    });

    kort.addEventListener('keydown', (hendelse) => {
      if (hendelse.key === 'Enter' || hendelse.key === ' ') {
        hendelse.preventDefault();
        kort.click();
      }
    });
  });

  feed.querySelectorAll('.hjerte-knapp').forEach((knapp) => {
    knapp.addEventListener('click', (hendelse) => {
      hendelse.stopPropagation();

      const id         = knapp.dataset.id;
      const erNåLagret = veksleLagret(id);

      knapp.textContent = erNåLagret ? '♥' : '♡';
      knapp.classList.toggle('lagret', erNåLagret);
      knapp.setAttribute('aria-pressed', String(erNåLagret));
      knapp.setAttribute('aria-label', erNåLagret ? 'Fjern fra lagret' : 'Lagre event');
    });
  });
}
