/* lagret.js — localStorage-laget.
   Eneste ansvar: lagre og hente hvilke event-IDer brukeren har "hjertet".
   Ingen DOM, ingen fetch — ren logikk mot nettleserens localStorage. */

/* Nøkkelen vi bruker i localStorage. Konstant så vi aldri skriver den feil. */
const LAGRET_NOKKEL = 'paby-lagret';

/**
 * Henter lista med lagrede event-IDer fra localStorage.
 * Returnerer alltid en liste — tom liste hvis ingenting er lagret.
 */
export function hentLagredeIder() {
  const lagret = localStorage.getItem(LAGRET_NOKKEL);
  /* JSON.parse konverterer JSON-strengen tilbake til en JS-liste.
     Hvis ingenting er lagret er lagret null, og vi returnerer tom liste. */
  return lagret ? JSON.parse(lagret) : [];
}

/**
 * Sjekker om et event med gitt ID er lagret.
 * @returns {boolean}
 */
export function erLagret(id) {
  return hentLagredeIder().includes(id);
}

/**
 * Lagrer et event. Gjør ingenting hvis det allerede er lagret.
 */
export function lagreEvent(id) {
  const ider = hentLagredeIder();
  if (!ider.includes(id)) {
    ider.push(id);
    /* JSON.stringify konverterer lista tilbake til en streng for lagring */
    localStorage.setItem(LAGRET_NOKKEL, JSON.stringify(ider));
  }
}

/**
 * Fjerner et event fra lagret.
 */
export function fjernEvent(id) {
  const ider = hentLagredeIder().filter((i) => i !== id);
  localStorage.setItem(LAGRET_NOKKEL, JSON.stringify(ider));
}

/**
 * Veksler lagret-status: lagret → fjern, ikke lagret → lagre.
 * @returns {boolean} true hvis eventet NÅ er lagret, false hvis det ble fjernet.
 */
export function veksleLagret(id) {
  if (erLagret(id)) {
    fjernEvent(id);
    return false;
  } else {
    lagreEvent(id);
    return true;
  }
}
