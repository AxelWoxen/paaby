/* lagret.js — localStorage-laget.
   Eneste ansvar: lagre og hente hvilke arrangement-ID-er brukeren har hjertet.
   All lesing og skriving er pakket i try/catch — appen krasjer ikke ved korrupt lagring.
   Ingen DOM, ingen fetch. */

const LAGRET_NOKKEL = 'paaby-lagret';

/**
 * Henter lista med lagrede arrangement-ID-er fra localStorage.
 * Returnerer alltid en liste — tom liste ved feil eller tom lagring.
 * Rensker automatisk bort duplikater og ikke-streng-verdier.
 *
 * @param {string[]} [gyldigeIder]  - Valgfri liste over kjente ID-er. Brukes til å rydde bort foreldreløse.
 * @returns {string[]}
 */
export function hentLagredeIder(gyldigeIder = null) {
  try {
    const rå = localStorage.getItem(LAGRET_NOKKEL);
    if (!rå) return [];

    const parset = JSON.parse(rå);
    if (!Array.isArray(parset)) {
      console.warn('Påby lagring: ugyldig format i localStorage — starter med tom liste');
      return [];
    }

    /* Behold bare strenger og fjern duplikater */
    let ider = [...new Set(parset.filter((id) => typeof id === 'string'))];

    /* Rens foreldreløse ID-er dersom vi vet hvilke som er gyldige */
    if (gyldigeIder) {
      const kjent = new Set(gyldigeIder);
      ider = ider.filter((id) => kjent.has(id));
    }

    return ider;
  } catch {
    console.warn('Påby lagring: kunne ikke lese localStorage');
    return [];
  }
}

/**
 * Sjekker om et arrangement med gitt ID er lagret.
 * @returns {boolean}
 */
export function erLagret(id) {
  return hentLagredeIder().includes(id);
}

/**
 * Lagrer et arrangement. Gjør ingenting hvis det allerede er lagret.
 */
export function lagreEvent(id) {
  try {
    const ider = hentLagredeIder();
    if (!ider.includes(id)) {
      ider.push(id);
      localStorage.setItem(LAGRET_NOKKEL, JSON.stringify(ider));
    }
  } catch {
    console.warn('Påby lagring: kunne ikke skrive til localStorage');
  }
}

/**
 * Fjerner et arrangement fra lagret.
 */
export function fjernEvent(id) {
  try {
    const ider = hentLagredeIder().filter((i) => i !== id);
    localStorage.setItem(LAGRET_NOKKEL, JSON.stringify(ider));
  } catch {
    console.warn('Påby lagring: kunne ikke skrive til localStorage');
  }
}

/**
 * Veksler lagret-status: lagret → fjern, ikke lagret → lagre.
 * @returns {boolean}  true hvis arrangementet NÅ er lagret
 */
export function veksleLagret(id) {
  if (erLagret(id)) {
    fjernEvent(id);
    return false;
  }
  lagreEvent(id);
  return true;
}
