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
    surface,
    position: Number(el.dataset.impresjonsposisjon) || null,
  });
}

/**
 * Observerer en liste med kort-elementer for den gitte produktflaten.
 * Kalles på nytt hver gang feeden rendres (gammel observer kobles aldri
 * fra manuelt — korte, utskiftede DOM-noder blir automatisk GC-et sammen
 * med sin IntersectionObserver-referanse).
 *
 * @param {HTMLElement[]} elementer  - kort-elementer, MÅ ha dataset.id
 * @param {string}        surface   - 'forside' | 'utforsk' | 'lagret' | 'følger'
 */
export function observerImpresjoner(elementer, surface) {
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

  elementer.forEach((el, indeks) => {
    const eventId = el.dataset.id;
    if (!eventId) return;
    if (alleredeSendt.has(lagNøkkel(surface, eventId))) return; // slipp å observere noe vi uansett ikke vil sende på nytt

    el.dataset.impresjonsposisjon = String(indeks + 1);
    observer.observe(el);
  });
}
