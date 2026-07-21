/* feed.js — presentasjonslaget for kortlisten.
   Bygger DOM-elementer direkte (ingen innerHTML med brukerdata) for å unngå XSS. */

/* ─── IKON ───────────────────────────────────────────────────────────────────
   Bytt ut path-dataene her for å bruke et annet binders-ikon.
   Eller erstatt hele strengen med en annen SVG-form. */
const BINDERS_SVG = '<svg class="binders-ikon" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" stroke="currentColor" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"/></svg>';

import { erLagret, veksleLagret }                               from '../application/lagret.js';
import { formaterPrisTekst, formaterTid, formaterAvstand,
         kategoriVisningsnavn }                                  from '../application/formatering.js';
import { hentEventbilde, KATEGORI_BILDER }                       from '../application/kategori-bilder.js';
import { åpneModal }                                             from './modal.js';


/* ========================
   BILDE-FALLBACK
   ======================== */

function lagPlaceholder(kategori) {
  const div = document.createElement('div');
  div.className = `kort-bilde-placeholder kategori-${kategori}`;
  return div;
}

/* Laster bildet for et event med to-trinns fallback:
   event.bilde → kategoribilde → placeholder-div.
   { once: true } på hvert trinn hindrer uendelig error-loop. */
function lagBildeEllement(event) {
  const img = document.createElement('img');
  img.src       = hentEventbilde(event);
  img.alt       = '';
  img.className = 'kort-bilde';
  img.loading   = 'lazy';

  const harEgetBilde = Boolean(event.bilde);

  img.addEventListener('error', () => {
    const kategoriSrc = KATEGORI_BILDER[event.kategori];
    if (harEgetBilde && kategoriSrc) {
      img.src = kategoriSrc;
      img.addEventListener('error', () => img.replaceWith(lagPlaceholder(event.kategori)), { once: true });
    } else {
      img.replaceWith(lagPlaceholder(event.kategori));
    }
  }, { once: true });

  return img;
}


/* ========================
   GJENTAS-TEKST
   ======================== */

function gjentasTekst(gjentas) {
  if (!gjentas) return null;
  if (gjentas.startsWith('ukentlig:'))     return `hver ${gjentas.slice(9)}`;
  if (gjentas.startsWith('månedlig:siste-')) return `siste ${gjentas.slice(15)} i mnd`;
  return null;
}


/* ========================
   KORTET
   ======================== */

export function lagKort(event) {
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

  bildeWrapper.appendChild(lagBildeEllement(event));

  /* Kategori-badge */
  const badge = document.createElement('span');
  badge.className = `kort-kategori kategori-${event.kategori}`;
  badge.textContent = kategoriVisningsnavn(event.kategori);
  bildeWrapper.appendChild(badge);

  /* Gjentas-badge (ribbon øvre høyre hjørne) */
  const gjentasTekstVerdi = gjentasTekst(event.gjentas);
  if (gjentasTekstVerdi) {
    const gjentasBadge = document.createElement('div');
    gjentasBadge.className   = 'gjentas-badge';
    gjentasBadge.textContent = gjentasTekstVerdi;
    bildeWrapper.appendChild(gjentasBadge);
  }

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
  knapp.innerHTML = BINDERS_SVG;
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

  const alleEventer = dagGrupper.flatMap((g) => g.eventer);

  if (alleEventer.length === 0) {
    const melding = document.createElement('p');
    melding.className = 'tom-feed';
    melding.textContent = erLagretVisning
      ? 'Ingenting lagret enda — trykk hjertet på det du vil på.'
      : 'Ingenting matchet — løsne på filtrene, så finner vi noe.';
    feed.appendChild(melding);
    return;
  }

  for (const gruppe of dagGrupper) {
    const seksjon = document.createElement('section');
    seksjon.className = 'dag-gruppe';

    /* label === null ved global sortering (pris/avstand) — ingen dagoverskrift */
    if (gruppe.label) {
      const overskrift = document.createElement('h2');
      overskrift.className   = 'dag-overskrift';
      overskrift.textContent = gruppe.label;
      seksjon.appendChild(overskrift);
    }

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

export function leggTilKortLyttere(feed, eventer) {
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
      knapp.classList.toggle('lagret', erNåLagret);
      knapp.setAttribute('aria-pressed', String(erNåLagret));
      knapp.setAttribute('aria-label', erNåLagret ? 'Fjern fra lagret' : 'Lagre arrangement');

      /* Liten pop-animasjon ved lagring */
      if (erNåLagret) {
        knapp.classList.remove('binders-pop');
        void knapp.offsetWidth; /* tving reflow for å re-trigge animasjonen */
        knapp.classList.add('binders-pop');
      }

      /* Informer resten av appen (main.js lytter for å oppdatere feed og modal) */
      document.dispatchEvent(new CustomEvent('paaby:lagret-endret', {
        detail: { id, lagret: erNåLagret },
      }));
    });
  });
}
