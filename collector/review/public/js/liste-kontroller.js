/* liste-kontroller.js — felles sortering og datofilter for adminlistene
   (Fra API, Til vurdering, Innsendte, Publiserte). Hver visning gir sin
   verktøylinje som host og får tilbake filtrer()/sorter() å bruke i render().

   Standard er «Nyest lagt til» — det som nettopp kom inn havner øverst.
   «Lagt til» leses fra lagtTil-feltet (created_at i databasen, se
   collector/store/candidates-db.js og published.js). Datofilteret ser på
   eventets start i Oslo-tid, ikke reviewerens lokale tid. */

import { osloKomponenter, lagOsloDato } from './oslo-tid.js';
import { lagPeriodeKalender } from './periode-kalender.js';

const SORTERINGER = [
  ['nyeste', 'Nyest lagt til'],
  ['eldste', 'Eldst lagt til'],
  ['dato', 'Dato – tidligst først'],
  ['dato-sen', 'Dato – senest først'],
];

const LAGT_TIL = [
  ['alle', 'Lagt til: når som helst'],
  ['24t', 'Lagt til siste 24 timer'],
  ['7d', 'Lagt til siste 7 dager'],
  ['30d', 'Lagt til siste 30 dager'],
];

const DATOER = [
  ['alle', 'Alle datoer'],
  ['i-dag', 'I dag'],
  ['i-morgen', 'I morgen'],
  ['7d', 'Neste 7 dager'],
  ['30d', 'Neste 30 dager'],
  ['egen', 'Velg datoer…'],
];

const TIME_MS = 60 * 60 * 1000;
const LAGT_TIL_MS = { '24t': 24 * TIME_MS, '7d': 7 * 24 * TIME_MS, '30d': 30 * 24 * TIME_MS };

function lagSelect(valg, etikett) {
  const select = document.createElement('select');
  select.className = 'admin-select liste-select';
  select.setAttribute('aria-label', etikett);
  for (const [verdi, tekst] of valg) {
    const o = document.createElement('option');
    o.value = verdi;
    o.textContent = tekst;
    select.appendChild(o);
  }
  return select;
}

// Oslo-midnatt `dager` dager fra i dag.
function osloMidnatt(dager) {
  const { år, maned, dag } = osloKomponenter(new Date());
  // Date.UTC normaliserer månedsskifte (31. + 1 → 1. neste måned).
  const d = new Date(Date.UTC(år, maned - 1, dag + dager));
  return lagOsloDato(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

// 'YYYY-MM-DD' (fra periodekalenderen) → Oslo-midnatt den dagen, + `dager`.
function osloMidnattFor(datoStreng, dager = 0) {
  const [år, maned, dag] = datoStreng.split('-').map(Number);
  const d = new Date(Date.UTC(år, maned - 1, dag + dager));
  return lagOsloDato(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

// Egendefinert periode fra kalenderen — «til» er inklusiv.
function egetIntervall(fra, til) {
  if (!fra && !til) return null;
  return [
    fra ? osloMidnattFor(fra) : new Date(-8.64e15),
    til ? osloMidnattFor(til, 1) : new Date(8.64e15),
  ];
}

function datoIntervall(valg) {
  if (valg === 'i-dag') return [osloMidnatt(0), osloMidnatt(1)];
  if (valg === 'i-morgen') return [osloMidnatt(1), osloMidnatt(2)];
  if (valg === '7d') return [osloMidnatt(0), osloMidnatt(7)];
  if (valg === '30d') return [osloMidnatt(0), osloMidnatt(30)];
  return null;
}

const tid = (iso) => (iso ? new Date(iso).getTime() : NaN);

/* lagtTil: (event) => ISO-streng. Events uten tidsstempel sorteres sist
   og faller ut av «Lagt til siste …»-filtrene.
   ekstraSorteringer: [[verdi, tekst, sammenlign]] — visningsspesifikke valg
   (f.eks. agentens «Mest relevant» i Fra API), lagt rett etter standardvalget. */
export function lagListeKontroller(host, { lagtTil, onEndring, ekstraSorteringer = [] }) {
  const ekstra = new Map(ekstraSorteringer.map(([verdi, , sammenlign]) => [verdi, sammenlign]));
  const sorteringsValg = [
    SORTERINGER[0],
    ...ekstraSorteringer.map(([verdi, tekst]) => [verdi, tekst]),
    ...SORTERINGER.slice(1),
  ];
  const tilstand = { sortering: 'nyeste', lagtTil: 'alle', dato: 'alle', fra: '', til: '' };

  const wrap = document.createElement('div');
  wrap.className = 'liste-kontroller';

  // «Velg datoer…» viser periodekalenderen (klikk start, klikk slutt).
  const kalender = lagPeriodeKalender({
    onEndring: ({ fra, til }) => {
      tilstand.fra = fra;
      tilstand.til = til;
      onEndring();
    },
  });
  kalender.el.hidden = true;

  for (const [nokkel, valg, etikett] of [
    ['sortering', sorteringsValg, 'Sorter'],
    ['lagtTil', LAGT_TIL, 'Filtrer på når eventet ble lagt til'],
    ['dato', DATOER, 'Filtrer på eventdato'],
  ]) {
    const select = lagSelect(valg, etikett);
    select.addEventListener('change', () => {
      tilstand[nokkel] = select.value;
      if (nokkel === 'dato') {
        kalender.el.hidden = select.value !== 'egen';
        if (kalender.el.hidden) kalender.lukk();
        else if (!tilstand.fra) kalender.apne();
      }
      onEndring();
    });
    wrap.appendChild(select);
  }

  wrap.appendChild(kalender.el);
  host.appendChild(wrap);

  function filtrer(liste) {
    const nå = Date.now();
    const lagtTilGrense = LAGT_TIL_MS[tilstand.lagtTil];
    const intervall = tilstand.dato === 'egen'
      ? egetIntervall(tilstand.fra, tilstand.til)
      : datoIntervall(tilstand.dato);
    return liste.filter((e) => {
      if (lagtTilGrense && !(nå - tid(lagtTil(e)) <= lagtTilGrense)) return false;
      if (intervall) {
        const start = tid(e.start);
        if (!(start >= intervall[0].getTime() && start < intervall[1].getTime())) return false;
      }
      return true;
    });
  }

  function sorter(liste) {
    const s = tilstand.sortering;
    if (ekstra.has(s)) {
      const sammenlign = ekstra.get(s);
      return liste.slice().sort((a, b) => sammenlign(a, b) || tid(a.start) - tid(b.start));
    }
    const nokkel = s === 'nyeste' || s === 'eldste' ? (e) => tid(lagtTil(e)) : (e) => tid(e.start);
    const retning = s === 'nyeste' || s === 'dato-sen' ? -1 : 1;
    return liste.slice().sort((a, b) => {
      const ta = nokkel(a);
      const tb = nokkel(b);
      if (Number.isNaN(ta) !== Number.isNaN(tb)) return Number.isNaN(ta) ? 1 : -1;
      if (ta !== tb && !Number.isNaN(ta)) return (ta - tb) * retning;
      return tid(a.start) - tid(b.start);
    });
  }

  return {
    filtrer,
    sorter,
    erFiltrert: () => tilstand.lagtTil !== 'alle'
      || (tilstand.dato === 'egen' ? Boolean(tilstand.fra || tilstand.til) : tilstand.dato !== 'alle'),
    sortererPaaDato: () => tilstand.sortering === 'dato' || tilstand.sortering === 'dato-sen',
  };
}
