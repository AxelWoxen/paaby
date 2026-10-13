/* sporing.js — vendor-nøytral hendelsessporing.
 *
 * ══════════════════════════════════════════════════════════
 * AKTIV KOBLING: Umami (cookieless) — se ANALYSE-SCRIPT-blokken i
 * index.html for script-tag og hvor du finner Website ID-en din.
 * window.__paaby_track er definert der:
 *
 *   window.__paaby_track = (navn, data) => window.umami?.track(navn, data);
 *
 * Vil du bytte analyse-verktøy senere, er dette det ENESTE stedet som må
 * endres — resten av appen kaller kun trackEvent() under, aldri verktøyet
 * direkte. Andre alternative koblinger (samme mønster, andre biblioteker):
 *
 *    Microsoft Clarity:
 *      window.__paaby_track = (navn, data) =>
 *        window.clarity?.('set', navn, JSON.stringify(data));
 *
 *    Plausible:
 *      window.__paaby_track = (navn, data) =>
 *        window.plausible?.(navn, { props: data });
 *
 *    Posthog:
 *      window.__paaby_track = (navn, data) =>
 *        window.posthog?.capture(navn, data);
 *
 * trackEvent() gjør ingenting (og krasjer ikke) hvis:
 *   — brukeren ikke har samtykket ennå (samtykke-stripen, se main.js)
 *   — window.__paaby_track ikke er definert (f.eks. Website ID ikke satt ennå)
 *
 * EKSTRA SINKER: i tillegg til window.__paaby_track kan andre moduler
 * registrere seg som mottaker av ALLE trackEvent()-kall via
 * registrerAnalyseSink() — brukt av js/main.js til å videresende relevante
 * hendelser til vårt eget first-party analytics-API
 * (js/network/analytics-api.js). sporing.js vet selv ingenting om hvilke
 * hendelser det er, eller hvordan de sendes — den eneste jobben her er
 * fortsatt bare "kall registrerte mottakere når sporing er aktivert".
 * ══════════════════════════════════════════════════════════
 */

let sporingsAktivert = false;
const ekstraSinker = [];

/** Kalles av samtykke-logikken i main.js etter at brukeren har klikket Ok. */
export function aktiverSporing() {
  sporingsAktivert = true;
}

/**
 * Registrerer en ekstra mottaker av alle trackEvent()-kall (i tillegg til
 * window.__paaby_track). Kalles av js/main.js ved oppstart.
 * @param {(navn: string, data: Object) => void} sink
 */
export function registrerAnalyseSink(sink) {
  ekstraSinker.push(sink);
}

/**
 * Send en hendelse til det koblede analyse-verktøyet.
 * Gjør ingenting hvis sporing ikke er aktivert eller ingen adapter er koblet på.
 *
 * @param {string} navn   — hendelsesnavn, f.eks. 'filter_valgt'
 * @param {Object} [data] — valgfrie egenskaper
 */
export function trackEvent(navn, data = {}) {
  if (!sporingsAktivert) return;
  try {
    if (typeof window.__paaby_track === 'function') {
      window.__paaby_track(navn, data);
    }
  } catch {
    /* Sporingsfeil skal aldri krasje appen */
  }

  for (const sink of ekstraSinker) {
    try {
      sink(navn, data);
    } catch {
      /* Sporingsfeil skal aldri krasje appen */
    }
  }
}
