/* feed.js — presentasjonslaget for kortlisten.
   Bygger DOM-elementer direkte (ingen innerHTML med brukerdata) for å unngå XSS. */

import { erLagret, veksleLagret }              from '../application/lagret.js';
import { formaterPrisTekst, formaterTid, formaterAvstand } from '../application/formatering.js';
import { åpneModal }                           from './modal.js';


/* ========================
   BILDE-FALLBACK
   ======================== */

/* Erstatter ødelagt bilde med en kategori-farget placeholder.
   { once: true } hindrer uendelig onerror-loop. */
function leggTilBildeFallback(img, kategori) {
  img.addEventListener('error', () => {
    const placeholder = document.createElement('div');
    placeholder.className = `kort-bilde-placeholder kategori-${kategori}`;
    img.replaceWith(placeholder);
  }, { once: true });
}


/* ========================
   KORTET
   ======================== */

function lagKort(event) {
  const lagret = erLagret(event.id);

  const artikkel = document.createElement('article');
  artikkel.className = 'kort';
  artikkel.dataset.id = event.id;
  artikkel.setAttribute('role', 'button');
  artikkel.setAttribute('tabindex', '0');
  artikkel.setAttribute('aria-label', `Åpne detaljer for ${event.tittel}`);

  /* Bildewrapper */
  const bildeWrapper = document.createElement('div');
  bildeWrapper.className = 'kort-bilde-wrapper';

  if (event.bilde) {
    const img = document.createElement('img');
    img.src      = event.bilde;
    img.alt      = '';           /* dekorativt bilde — tittel er i h2 */
    img.className = 'kort-bilde';
    img.loading  = 'lazy';
    leggTilBildeFallback(img, event.kategori);
    bildeWrapper.appendChild(img);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = `kort-bilde-placeholder kategori-${event.kategori}`;
    bildeWrapper.appendChild(placeholder);
  }

  /* Kategori-badge */
  const badge = document.createElement('span');
  badge.className = `kort-kategori kategori-${event.kategori}`;
  badge.textContent = event.kategori;
  bildeWrapper.appendChild(badge);

  /* Hjerte-knapp */
  const hjerteKnapp = lagHjerteKnapp(event.id, lagret);
  bildeWrapper.appendChild(hjerteKnapp);

  artikkel.appendChild(bildeWrapper);

  /* Tekstinnhold */
  const innhold = document.createElement('div');
  innhold.className = 'kort-innhold';

  const tittel = document.createElement('h2');
  tittel.className   = 'kort-tittel';
  tittel.textContent = event.tittel;
  innhold.appendChild(tittel);

  const meta = document.createElement('div');
  meta.className = 'kort-meta';

  const sted = document.createElement('span');
  sted.className   = 'sted';
  sted.textContent = event.sted;
  meta.appendChild(sted);

  if (event._avstand != null) {
    const avstand = document.createElement('span');
    avstand.className   = 'avstand';
    avstand.textContent = formaterAvstand(event._avstand);
    meta.appendChild(avstand);
  }
  innhold.appendChild(meta);

  const footer = document.createElement('div');
  footer.className = 'kort-footer';

  const tid = document.createElement('span');
  tid.className   = 'tid';
  tid.textContent = formaterTid(event.start);
  footer.appendChild(tid);

  const pris = document.createElement('span');
  const prisTekst = formaterPrisTekst(event.pris, event.prisTekst);
  if ((event.pris ?? 0) === 0 && event.pris !== null) {
    pris.className = 'pris-gratis';
  }
  pris.textContent = prisTekst;
  footer.appendChild(pris);

  innhold.appendChild(footer);
  artikkel.appendChild(innhold);

  return artikkel;
}

function lagHjerteKnapp(id, erLagretNå) {
  const knapp = document.createElement('button');
  knapp.className = `hjerte-knapp${erLagretNå ? ' lagret' : ''}`;
  knapp.dataset.id = id;
  knapp.textContent = erLagretNå ? '♥' : '♡';
  knapp.setAttribute('aria-pressed', String(erLagretNå));
  knapp.setAttribute('aria-label', erLagretNå ? 'Fjern fra lagret' : 'Lagre arrangement');
  return knapp;
}


/* ========================
   SYNKRONISERING
   ======================== */

/**
 * Oppdaterer alle hjerte-knapper i feeden med gitt ID.
 * Kalles fra modal.js etter at brukeren lagrer/fjerner derfra.
 */
export function synkroniserKortHjerte(id, erNåLagret) {
  document.querySelectorAll(`.hjerte-knapp[data-id]`).forEach((knapp) => {
    if (knapp.dataset.id !== id) return;
    knapp.textContent = erNåLagret ? '♥' : '♡';
    knapp.classList.toggle('lagret', erNåLagret);
    knapp.setAttribute('aria-pressed', String(erNåLagret));
    knapp.setAttribute('aria-label', erNåLagret ? 'Fjern fra lagret' : 'Lagre arrangement');
  });
}


/* ========================
   VISNING
   ======================== */

/**
 * Erstatter innholdet i #feed med dag-seksjoner og kort.
 *
 * @param {Array}   dagGrupper       - [{ nokkel, label, eventer }]
 * @param {boolean} erLagretVisning
 */
export function visEventer(dagGrupper, erLagretVisning) {
  const feed = document.getElementById('feed');
  feed.innerHTML = '';

  if (dagGrupper.length === 0) {
    const melding = document.createElement('p');
    melding.className = 'tom-feed';
    melding.textContent = erLagretVisning
      ? 'Ingenting lagret enda — trykk hjertet på det du vil på.'
      : 'Ingenting matchet — løsne på filtrene, så finner vi noe.';
    feed.appendChild(melding);
    return;
  }

  const alleEventer = dagGrupper.flatMap((g) => g.eventer);

  for (const gruppe of dagGrupper) {
    const seksjon = document.createElement('section');
    seksjon.className = 'dag-gruppe';

    const overskrift = document.createElement('h2');
    overskrift.className   = 'dag-overskrift';
    overskrift.textContent = gruppe.label;
    seksjon.appendChild(overskrift);

    const kortWrapper = document.createElement('div');
    kortWrapper.className = 'dag-kort';

    for (const event of gruppe.eventer) {
      kortWrapper.appendChild(lagKort(event));
    }

    seksjon.appendChild(kortWrapper);
    feed.appendChild(seksjon);
  }

  leggTilKortLyttere(feed, alleEventer);
}


/* ========================
   HENDELSELYTTERE
   ======================== */

function leggTilKortLyttere(feed, eventer) {
  feed.querySelectorAll('.kort').forEach((kort) => {
    kort.addEventListener('click', (hendelse) => {
      if (hendelse.target.closest('.hjerte-knapp')) return;
      const event = eventer.find((e) => e.id === kort.dataset.id);
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
      const id          = knapp.dataset.id;
      const erNåLagret  = veksleLagret(id);

      /* Oppdater dette kortet */
      knapp.textContent = erNåLagret ? '♥' : '♡';
      knapp.classList.toggle('lagret', erNåLagret);
      knapp.setAttribute('aria-pressed', String(erNåLagret));
      knapp.setAttribute('aria-label', erNåLagret ? 'Fjern fra lagret' : 'Lagre arrangement');

      /* Informer resten av appen (main.js lytter for å oppdatere feed og modal) */
      document.dispatchEvent(new CustomEvent('paaby:lagret-endret', {
        detail: { id, lagret: erNåLagret },
      }));
    });
  });
}
