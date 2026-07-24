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
 * ══════════════════════════════════════════════════════════
 */

let sporingsAktivert = false;

/** Kalles av samtykke-logikken i main.js etter at brukeren har klikket Ok. */
export function aktiverSporing() {
  sporingsAktivert = true;
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
}
