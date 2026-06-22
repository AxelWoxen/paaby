/* formatering.js — rene formateringsfunksjoner.
   Ingen DOM, ingen fetch. Konverterer rå data til lesbare strenger. */

const UKEDAGER_KORT = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'];
const MÅNEDER       = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];

/**
 * Konverterer pris (tall i kr) til lesbar streng.
 * Returnerer HTML slik at "Gratis" kan styles i lime.
 */
export function formaterPrisHtml(pris) {
  if ((pris ?? 0) === 0) return '<span class="pris-gratis">Gratis</span>';
  return `${pris} kr`;
}

/**
 * Konverterer pris til ren tekst (for modal faktarad).
 */
export function formaterPrisTekst(pris) {
  if ((pris ?? 0) === 0) return 'Gratis';
  return `${pris} kr`;
}

/**
 * "Fre 26. jun · 23:00" — brukes på kortene.
 */
export function formaterTid(isoStreng) {
  const dato    = new Date(isoStreng);
  const dagNavn = UKEDAGER_KORT[dato.getDay()];
  const timer   = String(dato.getHours()).padStart(2, '0');
  const min     = String(dato.getMinutes()).padStart(2, '0');

  return `${kapitaliser(dagNavn)} ${dato.getDate()}. ${MÅNEDER[dato.getMonth()]} · ${timer}:${min}`;
}

/**
 * "tor 25. jun 18:00" — brukes i modal faktarad.
 */
export function formaterTidKort(isoStreng) {
  const dato  = new Date(isoStreng);
  const timer = String(dato.getHours()).padStart(2, '0');
  const min   = String(dato.getMinutes()).padStart(2, '0');

  return `${UKEDAGER_KORT[dato.getDay()]} ${dato.getDate()}. ${MÅNEDER[dato.getMonth()]} ${timer}:${min}`;
}

/**
 * Avstand i km til lesbar streng.
 * Under 1 km: vis i meter. Returnerer tom streng hvis avstand er ukjent.
 */
export function formaterAvstand(avstand) {
  if (avstand == null) return '';
  if (avstand < 1) return `${Math.round(avstand * 1000)} m`;
  return `${avstand.toFixed(1)} km`;
}

/** Stor forbokstav. */
export function kapitaliser(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}
