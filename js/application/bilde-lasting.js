/* bilde-lasting.js — delt hjelper for skeleton-bakgrunn bak bilder.
   Brukes av feed.js, forside.js og modal.js slik at kort- og modalbilder
   oppfører seg identisk: skeleton-overlegget (CSS ::before på wrapper-
   elementet) fades bort først når <img> faktisk er ferdig lastet. */

/**
 * Merker bildets forelder (wrapper-elementet) som ferdig lastet —
 * CSS-en for .bilde-lastet tar seg av selve overgangen.
 * @param {HTMLImageElement} img
 */
export function markerBildeLastet(img) {
  img.parentElement?.classList.add('bilde-lastet');
}

/**
 * Kobler et <img>-element til skeleton-lastetilstanden: merker wrapperen
 * som ferdig så snart bildet laster (eller allerede er ferdig lastet fra
 * cache — derfor sjekkes img.complete først, ikke bare onload).
 * @param {HTMLImageElement} img
 */
export function bindBildeLasting(img) {
  if (img.complete && img.naturalWidth > 0) {
    markerBildeLastet(img);
    return;
  }
  img.addEventListener('load', () => markerBildeLastet(img), { once: true });
}
