/* impresjoner.js — first-party "event_impression"-sporing.
   Enkel IntersectionObserver-basert "faktisk sett"-sjekk: minst 50% av
   kortet synlig i minst 750ms, før vi sender event_impression. Ingen
   scroll-koordinater eller kontinuerlig viewport-data logges — kun at
   impresjonen skjedde, for hvilket event, på hvilken flate og posisjon.

   Dedupe: ÉN impresjon pr. event pr. surface pr. sidelast, holdt i et
   enkelt in-memory Set (ikke database-dedupe — se oppgavens DEL "IMPRESJONS-
   SIKKERHET"). Et event som filtreres/rerendres/sorteres/scrolles ut og inn
   igjen skal IKKE generere flere impresjoner. Kjent, akseptert begrensning:
   dedupe nullstilles ved sideoppfriskning (ny sidelast = ny "observasjon"). */

import { trackEvent } from './sporing.js';
import { RANGERINGS_VERSJON } from './analytics-events.js';

const SYNLIGHETSANDEL = 0.5;
const MINIMUM_SYNLIG_MS = 750;

const alleredeSendt = new Set(); // `${surface}::${eventId}`

function lagNøkkel(surface, eventId) {
  return `${surface}::${eventId}`;
}

function sendImpresjon(el, surface) {
  const eventId = el.dataset.id;
  if (!eventId) return;

  const nøkkel = lagNøkkel(surface, eventId);
  if (alleredeSendt.has(nøkkel)) return;
  alleredeSendt.add(nøkkel);

  trackEvent('event_impression', {
    id: eventId,
    kategori: el.dataset.kategori || null,
    ...hentVisningsKontekst(el),
    surface,
  });
}

/**
 * Leser visningskonteksten observerImpresjoner() stemplet på et kort-element
 * (eller nærmeste forelder med den). Brukes når et kort åpnes/lagres, slik at
 * handlingen kan kobles til nøyaktig den lista og posisjonen den skjedde i.
 * Returnerer {} for elementer som aldri har vært i en observert liste
 * (f.eks. en modal åpnet direkte via delt #event/-lenke).
 *
 * @param {HTMLElement|null} el
 * @returns {{ surface?: string, position?: number, feed_id?: string, sort?: string, algo_version?: string }}
 */
export function hentVisningsKontekst(el) {
  const kort = el?.closest?.('[data-feed-id]');
  if (!kort) return {};
  const { surface, feedId, impresjonsposisjon, sortering } = kort.dataset;
  return {
    surface,
    position: Number(impresjonsposisjon) || null,
    feed_id: feedId,
    sort: sortering || null,
    algo_version: RANGERINGS_VERSJON,
  };
}

/**
 * Observerer en liste med kort-elementer for den gitte produktflaten.
 * Kalles på nytt hver gang feeden rendres (gammel observer kobles aldri
 * fra manuelt — korte, utskiftede DOM-noder blir automatisk GC-et sammen
 * med sin IntersectionObserver-referanse).
 *
 * Hver kall er én "visning" av lista: alle kortene får samme ferske feed_id,
 * pluss surface, posisjon og sortering stemplet i dataset — også kort som
 * allerede har sendt impresjon, siden et klikk må kunne kobles til den
 * lista det faktisk skjedde i.
 *
 * @param {HTMLElement[]} elementer  - kort-elementer, MÅ ha dataset.id
 * @param {string}        surface   - 'forside' | 'utforsk' | 'lagret' | 'følger'
 * @param {{ sortering?: string }} [kontekst] - aktiv sortering, utelates der lista ikke er brukersortert (forsiden)
 */
export function observerImpresjoner(elementer, surface, { sortering = null } = {}) {
  const feedId = crypto.randomUUID();
  elementer.forEach((el, indeks) => {
    el.dataset.surface            = surface;
    el.dataset.feedId             = feedId;
    el.dataset.impresjonsposisjon = String(indeks + 1);
    if (sortering) el.dataset.sortering = sortering;
    else delete el.dataset.sortering;
  });

  if (typeof IntersectionObserver === 'undefined') return;

  const synlighetsTimere = new Map(); // element -> timeoutId

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const el = entry.target;

      if (entry.isIntersecting) {
        if (synlighetsTimere.has(el)) continue;
        const timeoutId = setTimeout(() => {
          synlighetsTimere.delete(el);
          observer.unobserve(el);
          sendImpresjon(el, surface);
        }, MINIMUM_SYNLIG_MS);
        synlighetsTimere.set(el, timeoutId);
      } else {
        const timeoutId = synlighetsTimere.get(el);
        if (timeoutId) {
          clearTimeout(timeoutId);
          synlighetsTimere.delete(el);
        }
      }
    }
  }, { threshold: SYNLIGHETSANDEL });

  elementer.forEach((el) => {
    const eventId = el.dataset.id;
    if (!eventId) return;
    if (alleredeSendt.has(lagNøkkel(surface, eventId))) return; // slipp å observere noe vi uansett ikke vil sende på nytt

    observer.observe(el);
  });
}
