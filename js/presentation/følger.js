/* følger.js — presentasjonslaget for "Følger"-visningen.
   Rendrer UKENS eventer (ikke alle fremtidige) gruppert per fulgt sted.
   Selve uke-vinduet (ukeMandag()/ukeVindu()/filtrerTilUke() + ukeOffset)
   beregnes i main.js — nøyaktig samme flyt som standardfeeden bruker —
   denne modulen mottar allerede uke-filtrerte eventer og grupperer dem
   per fulgt sted. Ingen egen uke-logikk her. */

import { lagKort, leggTilKortLyttere }        from './feed.js';
import { hentFulgteSteder, sluttÅFølge,
         normaliserSted }                      from '../application/fulgte-steder.js';
import { sorterEventer }                       from '../application/sortering.js';
import { trackEvent }                          from '../application/sporing.js';

/**
 * Rendrer følger-visningen inn i #feed.
 * @param {Object[]} ukensEventer - Eventer i valgt uke (passerte allerede fjernet av main.js)
 * @param {Function} onAvfølg     - Kalles etter at brukeren slutter å følge et sted
 */
export function visFølgerVisning(ukensEventer, onAvfølg) {
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

  const fulgteNøkler   = fulgte.map(normaliserSted);
  const harNoeDenneUka = ukensEventer.some((e) => fulgteNøkler.includes(normaliserSted(e.sted || '')));

  if (!harNoeDenneUka) {
    const p = document.createElement('p');
    p.className   = 'tom-feed';
    p.textContent = 'Ingen events fra stedene du følger denne uka.';
    feed.appendChild(p);
    return;
  }

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

    /* Beste innsats: venue-UUID finnes kun hvis stedet har minst ett event
       denne uka å slå opp mot — ellers faller sporingen tilbake til navnet
       alene (se trackEvent-kallet under). */
    const kampEvent = ukensEventer.find((e) => normaliserSted(e.sted || '') === normaliserSted(stedsnavn));
    if (kampEvent?.stedId) avfølgKnapp.dataset.stedId = kampEvent.stedId;

    header.appendChild(avfølgKnapp);

    seksjon.appendChild(header);

    /* Eventer på dette stedet, sortert etter dato */
    const nøkkel     = normaliserSted(stedsnavn);
    const stedEventer = sorterEventer(
      ukensEventer.filter((e) => normaliserSted(e.sted || '') === nøkkel),
      'tid-stigende',
    );

    if (stedEventer.length === 0) {
      const tom = document.createElement('p');
      tom.className   = 'følger-tom';
      tom.textContent = 'Ingenting denne uka.';
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

  /* Kortlyttere — åpner modal og håndterer lagre-knapp.
     ukensEventer dekker alle kort som faktisk ble rendret over. */
  leggTilKortLyttere(feed, ukensEventer);

  /* Avfølg-lyttere */
  feed.querySelectorAll('.avfølg-knapp').forEach((knapp) => {
    knapp.addEventListener('click', () => {
      sluttÅFølge(knapp.dataset.sted);
      trackEvent('sted_avfulgt', { sted: knapp.dataset.sted, venueId: knapp.dataset.stedId || null });
      onAvfølg();
    });
  });
}
