/* fulgte-steder.js — localStorage-laget for fulgte steder.
   Lagrer visningsnavn, men matcher normalisert (trim + lowercase).
   Ingen DOM, ingen fetch. */

const NOKKEL = 'paaby-fulgte-steder';

/** Normaliserer et stedsnavn for sammenligning – trim + lowercase. */
export function normaliserSted(sted) {
  return sted.trim().toLowerCase();
}

/**
 * Returnerer lista over fulgte steder (visningsnavn).
 * Alltid en liste — tom ved feil.
 */
export function hentFulgteSteder() {
  try {
    const rå = localStorage.getItem(NOKKEL);
    if (!rå) return [];
    const parset = JSON.parse(rå);
    if (!Array.isArray(parset)) return [];
    return [...new Set(parset.filter((s) => typeof s === 'string' && s.trim()))];
  } catch {
    console.warn('Påby fulgte steder: kunne ikke lese localStorage');
    return [];
  }
}

/** Sjekker om et sted er fulgt (normalisert matching). */
export function erFulgt(sted) {
  const nøkkel = normaliserSted(sted);
  return hentFulgteSteder().some((s) => normaliserSted(s) === nøkkel);
}

/**
 * Veksler fulgt-status.
 * @returns {boolean}  true hvis stedet NÅ er fulgt
 */
export function veksleFulgt(sted) {
  const nøkkel = normaliserSted(sted);
  try {
    const steder = hentFulgteSteder();
    const indeks = steder.findIndex((s) => normaliserSted(s) === nøkkel);
    if (indeks >= 0) {
      steder.splice(indeks, 1);
      localStorage.setItem(NOKKEL, JSON.stringify(steder));
      return false;
    }
    steder.push(sted.trim());
    localStorage.setItem(NOKKEL, JSON.stringify(steder));
    return true;
  } catch {
    console.warn('Påby fulgte steder: kunne ikke skrive til localStorage');
    return erFulgt(sted);
  }
}

/** Slutter å følge et sted direkte (brukes i følger-visningen). */
export function sluttÅFølge(sted) {
  const nøkkel = normaliserSted(sted);
  try {
    const steder = hentFulgteSteder().filter((s) => normaliserSted(s) !== nøkkel);
    localStorage.setItem(NOKKEL, JSON.stringify(steder));
  } catch {
    console.warn('Påby fulgte steder: kunne ikke skrive til localStorage');
  }
}
