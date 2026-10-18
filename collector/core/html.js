// html.js — konverterer enkel HTML (slik noen kilder, f.eks. Tikkio, leverer
// i description-feltet sitt) til ren tekst.
//
// Påbys frontend viser beskrivelse via textContent, aldri innerHTML (se
// js/presentation/modal.js, collector/review/public/js/views/candidate-kort.js)
// — den tolker ALDRI HTML. Uten dette ville rå tagger og entiteter
// (<p>, &amp; …) vist seg bokstavelig for brukeren. Ikke et sikkerhetstiltak
// (textContent er allerede trygt mot XSS) — kun et lesbarhetstiltak.

const ENTITETER = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#039': "'", nbsp: ' ',
};

function dekodEntiteter(tekst) {
  return tekst.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (match, kode) => {
    if (kode[0] === '#') {
      const erHex = kode[1]?.toLowerCase() === 'x';
      const kodepunkt = parseInt(erHex ? kode.slice(2) : kode.slice(1), erHex ? 16 : 10);
      return Number.isFinite(kodepunkt) ? String.fromCodePoint(kodepunkt) : match;
    }
    return ENTITETER[kode.toLowerCase()] ?? match;
  });
}

/**
 * @param {string|null|undefined} html
 * @returns {string|null}  ren tekst, whitespace kollapset, eller null hvis tom
 */
export function stripHtml(html) {
  if (typeof html !== 'string') return null;
  const utenTagger = html.replace(/<[^>]+>/g, ' ');
  const dekodet = dekodEntiteter(utenTagger);
  const trimmet = dekodet.replace(/\s+/g, ' ').trim();
  return trimmet || null;
}
