/* sporing.js — vendor-nøytral hendelsessporing.
 *
 * ══════════════════════════════════════════════════════════
 * KOBLE TIL ANALYSE — to steg:
 * ══════════════════════════════════════════════════════════
 *
 * 1. Lim inn analyse-script-taggen i <head> i index.html
 *    (se kommentarblokken merket ANALYSE-SCRIPT der).
 *
 * 2. Definer window.__paaby_track i det samme scriptet:
 *
 *    Microsoft Clarity:
 *      window.__paaby_track = (navn, data) =>
 *        window.clarity?.('set', navn, JSON.stringify(data));
 *
 *    Plausible:
 *      window.__paaby_track = (navn, data) =>
 *        window.plausible?.(navn, { props: data });
 *
 *    Umami:
 *      window.__paaby_track = (navn, data) =>
 *        window.umami?.track(navn, data);
 *
 *    Posthog:
 *      window.__paaby_track = (navn, data) =>
 *        window.posthog?.capture(navn, data);
 *
 * trackEvent() gjør ingenting (og krasjer ikke) hvis:
 *   — brukeren ikke har samtykket ennå
 *   — window.__paaby_track ikke er definert
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
