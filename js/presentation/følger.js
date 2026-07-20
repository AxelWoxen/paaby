/* følger.js — presentasjonslaget for "Følger"-visningen.
   Rendrer kommende eventer gruppert per fulgt sted. */

import { lagKort, leggTilKortLyttere }        from './feed.js';
import { hentFulgteSteder, sluttÅFølge,
         normaliserSted }                      from '../application/fulgte-steder.js';
import { skjulPasserte }                       from '../application/gruppering.js';
import { sorterEventer }                       from '../application/sortering.js';

/**
 * Rendrer følger-visningen inn i #feed.
 * @param {Object[]} alleEventer   - Alle kjente eventer (brukes til modal-oppslag)
 * @param {Function} onAvfølg      - Kalles etter at brukeren slutter å følge et sted
 */
export function visFølgerVisning(alleEventer, onAvfølg) {
  const feed = document.getElementById('feed');
  feed.innerHTML = '';

  const fulgte = hentFulgteSteder();

  if (fulgte.length === 0) {
    const p = document.createElement('p');
    p.className   = 'tom-feed';
    p.textContent = 'Følg et sted, så samler vi alt som kommer der her.';
    feed.appendChild(p);
    return;
  }

  const kommende = skjulPasserte(alleEventer);

  for (const stedsnavn of fulgte) {
    const seksjon = document.createElement('section');
    seksjon.className = 'følger-seksjon';

    /* Seksjonshode: stedsnavn + avfølg-knapp */
    const header = document.createElement('div');
    header.className = 'følger-seksjon-header';

    const tittel = document.createElement('h2');
    tittel.className   = 'følger-seksjon-tittel';
    tittel.textContent = stedsnavn;
    header.appendChild(tittel);

    const avfølgKnapp = document.createElement('button');
    avfølgKnapp.className      = 'avfølg-knapp';
    avfølgKnapp.textContent    = 'slutt å følge';
    avfølgKnapp.dataset.sted   = stedsnavn;
    header.appendChild(avfølgKnapp);

    seksjon.appendChild(header);

    /* Eventer på dette stedet, sortert etter dato */
    const nøkkel     = normaliserSted(stedsnavn);
    const stedEventer = sorterEventer(
      kommende.filter((e) => normaliserSted(e.sted || '') === nøkkel),
      'tid-stigende',
    );

    if (stedEventer.length === 0) {
      const tom = document.createElement('p');
      tom.className   = 'følger-tom';
      tom.textContent = 'Ingenting på plakaten akkurat nå.';
      seksjon.appendChild(tom);
    } else {
      const grid = document.createElement('div');
      grid.className = 'dag-kort';
      for (const event of stedEventer) {
        grid.appendChild(lagKort(event));
      }
      seksjon.appendChild(grid);
    }

    feed.appendChild(seksjon);
  }

  /* Kortlyttere — åpner modal og håndterer lagre-knapp */
  leggTilKortLyttere(feed, alleEventer);

  /* Avfølg-lyttere */
  feed.querySelectorAll('.avfølg-knapp').forEach((knapp) => {
    knapp.addEventListener('click', () => {
      sluttÅFølge(knapp.dataset.sted);
      onAvfølg();
    });
  });
}
