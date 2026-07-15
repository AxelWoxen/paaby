/* sortering.js — sorteringslogikk for arrangementslisten.
   Rene funksjoner: ingen DOM, ingen side-effekter, ingen global tilstand.

   _avstand er et internt felt på eventobjekter, angitt i KILOMETER (km).
   Det beregnes i main.js og er ikke en del av den opprinnelige datammodellen. */

/**
 * Sorterer en kopi av eventer-arrayen etter gitt sorteringsvalg.
 * Muterer aldri den opprinnelige arrayen.
 *
 * @param {Array}  eventer        - Eventer som allerede er filtrert
 * @param {string} sorteringsvalg - 'tid-stigende' | 'tid-synkende' | 'pris-stigende' |
 *                                  'pris-synkende' | 'avstand-stigende' | 'avstand-synkende'
 * @returns {Array} Ny sortert array
 */
export function sorterEventer(eventer, sorteringsvalg) {
  const kopi = [...eventer];
  switch (sorteringsvalg) {
    case 'tid-stigende':     return sorterTid(kopi,  1);
    case 'tid-synkende':     return sorterTid(kopi, -1);
    case 'pris-stigende':    return sorterPris(kopi,  1);
    case 'pris-synkende':    return sorterPris(kopi, -1);
    case 'avstand-stigende': return sorterAvstand(kopi,  1);
    case 'avstand-synkende': return sorterAvstand(kopi, -1);
    default:                 return sorterTid(kopi,  1);
  }
}

/** Returnerer true for avstandssorteringsverdier. */
export function erAvstandsSortering(sorteringsvalg) {
  return sorteringsvalg === 'avstand-stigende' || sorteringsvalg === 'avstand-synkende';
}

/** Returnerer true for tidssorteringsverdier. */
export function erTidsSortering(sorteringsvalg) {
  return sorteringsvalg === 'tid-stigende' || sorteringsvalg === 'tid-synkende';
}

/* ── Interne sorteringsfunksjoner ─────────────────────────────────── */

/* Sekundær tie-breaker: start stigende, deretter tittel alfabetisk (norsk). */
function tieBreaker(a, b) {
  const tA = new Date(a.start).getTime();
  const tB = new Date(b.start).getTime();
  const tDiff = (isNaN(tA) ? Infinity : tA) - (isNaN(tB) ? Infinity : tB);
  if (tDiff !== 0) return tDiff;
  return (a.tittel ?? '').localeCompare(b.tittel ?? '', 'nb-NO');
}

function sorterTid(kopi, retning) {
  return kopi.sort((a, b) => {
    const tA = new Date(a.start).getTime();
    const tB = new Date(b.start).getTime();
    const diff = ((isNaN(tA) ? Infinity : tA) - (isNaN(tB) ? Infinity : tB)) * retning;
    if (diff !== 0) return diff;
    return (a.tittel ?? '').localeCompare(b.tittel ?? '', 'nb-NO');
  });
}

/* null/ugyldig pris plasseres alltid sist, uavhengig av retning. */
function sorterPris(kopi, retning) {
  return kopi.sort((a, b) => {
    const pA = typeof a.pris === 'number' && !isNaN(a.pris) ? a.pris : null;
    const pB = typeof b.pris === 'number' && !isNaN(b.pris) ? b.pris : null;
    if (pA === null && pB === null) return tieBreaker(a, b);
    if (pA === null) return  1;
    if (pB === null) return -1;
    const diff = (pA - pB) * retning;
    if (diff !== 0) return diff;
    return tieBreaker(a, b);
  });
}

/* null/manglende avstand plasseres alltid sist, uavhengig av retning.
   _avstand er i km (se toppen av filen). */
function sorterAvstand(kopi, retning) {
  return kopi.sort((a, b) => {
    const dA = a._avstand != null && !isNaN(a._avstand) ? a._avstand : null;
    const dB = b._avstand != null && !isNaN(b._avstand) ? b._avstand : null;
    if (dA === null && dB === null) return tieBreaker(a, b);
    if (dA === null) return  1;
    if (dB === null) return -1;
    const diff = (dA - dB) * retning;
    if (diff !== 0) return diff;
    return tieBreaker(a, b);
  });
}
