// likhet.js — er to påby-events (sannsynligvis) samme arrangement?
// Ren funksjon, ingen DB. Brukes av core/sync.js:finnEksisterendeMatch.
//
// dedupe.js sin hash (tittel|dato|sted, eksakt) fanger kun identiske
// skrivemåter. Samme konsert ligger i praksis på flere billettplattformer
// med små forskjeller: «Karpe» vs «KARPE – Omar Sheriff-turné 2026»,
// «Rockefeller» vs «Rockefeller Music Hall», «Sentrum Scene» med og uten
// koordinater. Denne modulen gir et tall for hvor like to events er, og
// en tydelig grense for når vi er SIKRE nok til å koble i stedet for å
// opprette et nytt kort.

// Ord som sier noe om billettsalget eller formatet, ikke om HVA eventet er.
const STØYORD = new Set([
  'utsolgt', 'sold', 'out', 'soldout', 'nytt', 'tidspunkt', 'flyttet',
  'ekstrakonsert', 'ekstra', 'konsert', 'concert', 'live', 'tour', 'turne',
  'oslo', 'norway', 'norge', 'presents', 'presenterer', 'present',
  'support', 'with', 'med', 'feat', 'ft', 'and', 'og', 'the', 'i', 'pa',
  'at', 'hos', 'pres', 'billetter', 'tickets', 'vip', 'pakke', 'package',
]);

export function normaliserTekst(tekst) {
  return String(tekst ?? '')
    .toLowerCase()
    .replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function tittelOrd(tittel) {
  return normaliserTekst(tittel)
    .split(' ')
    .filter((ord) => ord.length > 1 && !STØYORD.has(ord) && !/^(19|20)\d{2}$/.test(ord));
}

function bigrammer(tekst) {
  const s = tekst.replace(/ /g, '');
  const ut = new Map();
  for (let i = 0; i < s.length - 1; i++) {
    const bi = s.slice(i, i + 2);
    ut.set(bi, (ut.get(bi) ?? 0) + 1);
  }
  return ut;
}

// Sørensen–Dice på tegn-bigrammer — tåler små skrivefeil og bøyninger.
function dice(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ba = bigrammer(a);
  const bb = bigrammer(b);
  let felles = 0;
  let totalt = 0;
  for (const n of ba.values()) totalt += n;
  for (const n of bb.values()) totalt += n;
  for (const [bi, n] of ba) felles += Math.min(n, bb.get(bi) ?? 0);
  return totalt ? (2 * felles) / totalt : 0;
}

/**
 * 0–1. Tar det beste av (a) tegnlikhet på de meningsbærende ordene og
 * (b) hvor stor del av den KORTESTE tittelen som finnes i den lengste —
 * «Karpe» er fullt inneholdt i «Karpe Omar Sheriff», men ikke omvendt.
 */
export function tittelLikhet(a, b) {
  const ordA = tittelOrd(a);
  const ordB = tittelOrd(b);
  if (!ordA.length || !ordB.length) return 0;

  const tegn = dice(ordA.join(' '), ordB.join(' '));

  const [kort, lang] = ordA.length <= ordB.length ? [ordA, ordB] : [ordB, ordA];
  const langSett = new Set(lang);
  const inneholdt = kort.filter((o) => langSett.has(o)).length / kort.length;
  // Ett felles ord alene («jazz», «quiz») er for svakt til å regnes som
  // inneholdt — da må tegnlikheten bære det.
  const inneholdtVekt = kort.length >= 2 || kort[0]?.length >= 5 ? inneholdt : 0;

  return Math.max(tegn, inneholdtVekt);
}

function avstandMeter(a, b) {
  const R = 6371000;
  const rad = (g) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Samme sted? Koordinater vinner når begge har dem (≤ 250 m), ellers navn.
 * @returns {boolean|null}  null = vet ikke (begge mangler sted)
 */
export function sammeSted(a, b) {
  const harKoord = (e) => typeof e.lat === 'number' && typeof e.lng === 'number';
  if (harKoord(a) && harKoord(b)) {
    return avstandMeter(a, b) <= 250;
  }
  const na = normaliserTekst(a.sted);
  const nb = normaliserTekst(b.sted);
  if (!na || !nb) return null;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  return dice(na, nb) >= 0.7;
}

function osloDag(iso) {
  // Starttider er alltid ISO med eksplisitt Oslo-offset (core/tid.js), så
  // de 10 første tegnene ER Oslo-kalenderdagen.
  return String(iso ?? '').slice(0, 10);
}

/**
 * Sammenligner to påby-events.
 *
 * sikker  — samme dag, starttid innen 30 min, svært lik tittel og samme
 *           sted. Brukes KUN til å koble på tvers av ULIKE kilder (se
 *           sync.js) — to rader fra samme kilde er per definisjon to
 *           ulike kilde-eventer (f.eks. to visninger samme kveld).
 * lignende — samme dag og tydelig lik tittel, eller samme sted og lik
 *           tittel. Blir ny candidate, flagget som mulig duplikat.
 *
 * @returns {{ nivå: 'sikker'|'lignende'|null, tittel: number }}
 */
export function sammenlign(a, b) {
  if (!a?.start || !b?.start || osloDag(a.start) !== osloDag(b.start)) {
    return { nivå: null, tittel: 0 };
  }

  const tittel = tittelLikhet(a.tittel, b.tittel);
  const sted = sammeSted(a, b);
  const minutterMellom = Math.abs(new Date(a.start) - new Date(b.start)) / 60000;

  if (tittel >= 0.85 && sted === true && minutterMellom <= 30) {
    return { nivå: 'sikker', tittel };
  }
  if ((tittel >= 0.85 && sted !== false) || (tittel >= 0.6 && sted === true)) {
    return { nivå: 'lignende', tittel };
  }
  return { nivå: null, tittel };
}
