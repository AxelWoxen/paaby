/* innsikt.js — «Innsikt»-fanen: server-aggregert produktanalyse.
   Henter ETT ferdig JSON-objekt fra GET /api/innsikt (se review/insight.js)
   og bygger DOM direkte (ingen innerHTML med data fra databasen/klienten —
   samme disiplin som resten av admin, se publiserte.js). Ingen aggregering
   skjer her — kun formatering/rendering av tall serveren allerede har regnet
   ut. */

import { api } from '../api.js';
import { visFeil } from '../toast.js';

let periode = '7';
let sisteData = null;

const el = {
  periodevelger: document.getElementById('innsikt-periodevelger'),
  siden: document.getElementById('innsikt-siden'),
  liteData: document.getElementById('innsikt-lite-data'),
  last: document.getElementById('innsikt-last'),
  innhold: document.getElementById('innsikt-innhold'),
  feil: document.getElementById('innsikt-feil'),
  feilTekst: document.getElementById('innsikt-feil-tekst'),
  kpi: document.getElementById('innsikt-kpi'),
  funnel: document.getElementById('innsikt-funnel'),
  tidsserie: document.getElementById('innsikt-tidsserie'),
  toppEvents: document.getElementById('innsikt-topp-events'),
  kategorier: document.getElementById('innsikt-kategorier'),
  tags: document.getElementById('innsikt-tags'),
  lagringsdybde: document.getElementById('innsikt-lagringsdybde'),
  retention: document.getElementById('innsikt-retention'),
  kilder: document.getElementById('innsikt-kilder'),
};


/* ========================
   FORMATERING
   ======================== */

function fmtTall(n) {
  return new Intl.NumberFormat('nb-NO').format(n ?? 0);
}

function fmtPct(verdi) {
  return verdi === null || verdi === undefined ? '–' : `${verdi}%`;
}

function fmtEndring(endringPct) {
  if (endringPct === null || endringPct === undefined) return '–';
  const tegn = endringPct > 0 ? '+' : '';
  return `${tegn}${endringPct}%`;
}

function endringKlasse(endringPct) {
  if (endringPct === null || endringPct === undefined) return '';
  return endringPct > 0 ? 'innsikt-opp' : endringPct < 0 ? 'innsikt-ned' : '';
}

function fmtDato(iso) {
  if (!iso) return '–';
  return new Date(iso).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' });
}


/* ========================
   GENERISK SORTERBAR TABELL
   kolonner: [{ key, label, numeric, verdi(row), vis(row) }]
   vis() returnerer en streng ELLER en DOM-node (textContent brukes for
   strenger — ingen innerHTML med data fra databasen).
   ======================== */

function lagSorterbarTabell({ kolonner, rader, defaultKey, defaultDesc = true, tomTekst = 'Ingen data i denne perioden.' }) {
  const wrapper = document.createElement('div');

  if (rader.length === 0) {
    const p = document.createElement('p');
    p.className = 'tom-melding';
    p.textContent = tomTekst;
    wrapper.appendChild(p);
    return wrapper;
  }

  let sortKey = defaultKey ?? kolonner[0].key;
  let sortDesc = defaultDesc;

  const table = document.createElement('table');
  table.className = 'innsikt-tabell';
  const thead = document.createElement('thead');
  const theadRad = document.createElement('tr');
  const tbody = document.createElement('tbody');

  function tegnKropp() {
    const sortert = [...rader].sort((a, b) => {
      const kol = kolonner.find((k) => k.key === sortKey);
      const va = kol.verdi(a);
      const vb = kol.verdi(b);
      const cmp = typeof va === 'string' ? va.localeCompare(vb) : (va ?? 0) - (vb ?? 0);
      return sortDesc ? -cmp : cmp;
    });

    tbody.innerHTML = '';
    for (const rad of sortert) {
      const tr = document.createElement('tr');
      for (const kol of kolonner) {
        const td = document.createElement('td');
        if (kol.numeric) td.className = 'innsikt-tall';
        const visning = kol.vis ? kol.vis(rad) : kol.verdi(rad);
        if (visning instanceof Node) td.appendChild(visning);
        else td.textContent = visning ?? '–';
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
  }

  for (const kol of kolonner) {
    const th = document.createElement('th');
    th.textContent = kol.label;
    th.tabIndex = 0;
    th.className = 'innsikt-th-sorterbar';
    th.addEventListener('click', () => {
      sortDesc = sortKey === kol.key ? !sortDesc : true;
      sortKey = kol.key;
      theadRad.querySelectorAll('th').forEach((t) => t.removeAttribute('data-sortert'));
      th.setAttribute('data-sortert', sortDesc ? 'desc' : 'asc');
      tegnKropp();
    });
    theadRad.appendChild(th);
  }
  thead.appendChild(theadRad);
  table.appendChild(thead);
  table.appendChild(tbody);
  tegnKropp();

  wrapper.appendChild(table);
  return wrapper;
}


/* ========================
   A. KPI-KORT
   ======================== */

const KPI_RENDER_ORDER = [
  'unikeBrukere', 'nyeBrukere', 'tilbakevendende', 'sessions',
  'eventaapnere', 'lagrere', 'harLagretNa', 'videreklikk', 'delere',
];

function renderKpi(summary) {
  el.kpi.innerHTML = '';
  for (const key of KPI_RENDER_ORDER) {
    const kpi = summary[key];
    if (!kpi) continue;

    const kort = document.createElement('div');
    kort.className = 'innsikt-kpi-kort';

    const navn = document.createElement('div');
    navn.className = 'innsikt-kpi-navn';
    navn.textContent = kpi.navn;

    const verdi = document.createElement('div');
    verdi.className = 'innsikt-kpi-verdi';
    verdi.textContent = fmtTall(kpi.verdi);

    const endring = document.createElement('div');
    endring.className = `innsikt-kpi-endring ${endringKlasse(kpi.endringPct)}`;
    endring.textContent = kpi.endringPct === null ? 'vs. forrige periode: –' : `vs. forrige periode: ${fmtEndring(kpi.endringPct)}`;

    kort.appendChild(navn);
    kort.appendChild(verdi);
    kort.appendChild(endring);
    el.kpi.appendChild(kort);
  }
}


/* ========================
   B. FUNNEL
   ======================== */

function renderFunnel(funnel) {
  el.funnel.innerHTML = '';
  const maksAntall = Math.max(1, ...funnel.map((s) => s.antall));

  for (const steg of funnel) {
    const rad = document.createElement('div');
    rad.className = 'innsikt-funnel-rad';

    const etikett = document.createElement('div');
    etikett.className = 'innsikt-funnel-etikett';
    etikett.textContent = steg.navn;

    const barWrap = document.createElement('div');
    barWrap.className = 'innsikt-funnel-bar-wrap';
    const bar = document.createElement('div');
    bar.className = 'innsikt-funnel-bar';
    bar.style.width = `${(steg.antall / maksAntall) * 100}%`;
    barWrap.appendChild(bar);

    const tall = document.createElement('div');
    tall.className = 'innsikt-funnel-tall';
    const prosentTekst = steg.prosentAvForrige === null
      ? fmtTall(steg.antall)
      : `${fmtTall(steg.antall)} (${fmtPct(steg.prosentAvForrige)} av forrige, ${fmtPct(steg.prosentAvAlle)} av alle)`;
    tall.textContent = prosentTekst;

    rad.appendChild(etikett);
    rad.appendChild(barWrap);
    rad.appendChild(tall);
    el.funnel.appendChild(rad);
  }
}


/* ========================
   C. TIDSSERIE — enkel inline SVG, ingen chart-bibliotek
   ======================== */

const TIDSSERIE_LINJER = [
  { key: 'unikeBrukere', label: 'Unike brukere', farge: 'var(--svart)' },
  { key: 'sessions', label: 'Sessions', farge: 'var(--graa)' },
  { key: 'eventaapninger', label: 'Eventåpninger', farge: 'var(--blaa)' },
  { key: 'lagringer', label: 'Lagringer', farge: 'var(--musikk)' },
  { key: 'videreklikk', label: 'Videreklikk', farge: 'var(--klubb)' },
];

function renderTidsserie(timeseries) {
  el.tidsserie.innerHTML = '';

  if (timeseries.length === 0) {
    const p = document.createElement('p');
    p.className = 'tom-melding';
    p.textContent = 'Ingen data i denne perioden.';
    el.tidsserie.appendChild(p);
    return;
  }

  const BREDDE = 760;
  const HOYDE = 220;
  const PAD = 28;

  const synlige = new Set(TIDSSERIE_LINJER.map((l) => l.key));

  const legende = document.createElement('div');
  legende.className = 'innsikt-tidsserie-legende';

  const svgWrapper = document.createElement('div');
  svgWrapper.className = 'innsikt-tidsserie-svg-wrapper';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${BREDDE} ${HOYDE}`);
  svg.setAttribute('class', 'innsikt-tidsserie-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Daglig utvikling i perioden');

  const akseX = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  akseX.setAttribute('x1', PAD); akseX.setAttribute('x2', BREDDE - 8);
  akseX.setAttribute('y1', HOYDE - PAD); akseX.setAttribute('y2', HOYDE - PAD);
  akseX.setAttribute('class', 'innsikt-tidsserie-akse');
  svg.appendChild(akseX);

  const polylinjer = new Map();

  function tegn() {
    polylinjer.forEach((p) => p.remove());
    polylinjer.clear();

    const aktiveLinjer = TIDSSERIE_LINJER.filter((l) => synlige.has(l.key));
    const maksVerdi = Math.max(1, ...aktiveLinjer.flatMap((l) => timeseries.map((d) => d[l.key])));

    const xSteg = (BREDDE - PAD - 8) / Math.max(1, timeseries.length - 1);
    const xFor = (i) => PAD + i * xSteg;
    const yFor = (v) => (HOYDE - PAD) - (v / maksVerdi) * (HOYDE - PAD - 10);

    for (const linje of aktiveLinjer) {
      const punkter = timeseries.map((d, i) => `${xFor(i)},${yFor(d[linje.key])}`).join(' ');
      const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      poly.setAttribute('points', punkter);
      poly.setAttribute('fill', 'none');
      poly.setAttribute('stroke', linje.farge);
      poly.setAttribute('stroke-width', '2');
      poly.setAttribute('class', 'innsikt-tidsserie-linje');
      svg.appendChild(poly);
      polylinjer.set(linje.key, poly);
    }
  }

  for (const linje of TIDSSERIE_LINJER) {
    const label = document.createElement('label');
    label.className = 'innsikt-tidsserie-legende-rad';

    const sjekkboks = document.createElement('input');
    sjekkboks.type = 'checkbox';
    sjekkboks.checked = true;
    sjekkboks.addEventListener('change', () => {
      if (sjekkboks.checked) synlige.add(linje.key);
      else synlige.delete(linje.key);
      tegn();
    });

    const prikk = document.createElement('span');
    prikk.className = 'innsikt-tidsserie-prikk';
    prikk.style.background = linje.farge;

    const tekst = document.createElement('span');
    tekst.textContent = linje.label;

    label.appendChild(sjekkboks);
    label.appendChild(prikk);
    label.appendChild(tekst);
    legende.appendChild(label);
  }

  tegn();
  svgWrapper.appendChild(svg);
  el.tidsserie.appendChild(legende);
  el.tidsserie.appendChild(svgWrapper);
}


/* ========================
   D. TOPP EVENTS
   ======================== */

function renderToppEvents(topEvents) {
  el.toppEvents.innerHTML = '';
  el.toppEvents.appendChild(lagSorterbarTabell({
    defaultKey: 'aapnere',
    rader: topEvents,
    tomTekst: 'Ingen eventåpninger i denne perioden.',
    kolonner: [
      { key: 'tittel', label: 'Event', verdi: (r) => r.tittel ?? '' },
      { key: 'sted', label: 'Sted', verdi: (r) => r.sted ?? '–' },
      { key: 'kategori', label: 'Kategori', verdi: (r) => r.kategori ?? '–' },
      { key: 'aapnere', label: 'Åpnere', numeric: true, verdi: (r) => r.aapnere },
      { key: 'lagrere', label: 'Lagrere', numeric: true, verdi: (r) => r.lagrere },
      { key: 'aktiveLagringerNa', label: 'Aktive lagringer nå', numeric: true, verdi: (r) => r.aktiveLagringerNa },
      { key: 'videreklikk', label: 'Videreklikk', numeric: true, verdi: (r) => r.videreklikk },
      { key: 'delinger', label: 'Delinger', numeric: true, verdi: (r) => r.delinger },
      { key: 'aapningTilLagringPct', label: 'Åpning → lagring', numeric: true, verdi: (r) => r.aapningTilLagringPct ?? -1, vis: (r) => fmtPct(r.aapningTilLagringPct) },
      { key: 'aapningTilVidereklikkPct', label: 'Åpning → videreklikk', numeric: true, verdi: (r) => r.aapningTilVidereklikkPct ?? -1, vis: (r) => fmtPct(r.aapningTilVidereklikkPct) },
    ],
  }));
}


/* ========================
   E/F. KATEGORIER OG TAGS
   ======================== */

function renderKategoriEllerTag(container, rader, navnKey, navnLabel) {
  container.innerHTML = '';
  container.appendChild(lagSorterbarTabell({
    defaultKey: 'aapnere',
    rader,
    tomTekst: 'Ingen data i denne perioden.',
    kolonner: [
      { key: navnKey, label: navnLabel, verdi: (r) => r[navnKey] ?? '–' },
      { key: 'aapnere', label: 'Unike åpnere', numeric: true, verdi: (r) => r.aapnere },
      { key: 'lagrere', label: 'Unike lagrere', numeric: true, verdi: (r) => r.lagrere },
      { key: 'videreklikk', label: 'Videreklikk', numeric: true, verdi: (r) => r.videreklikk },
      { key: 'saveRatePct', label: 'Save-rate', numeric: true, verdi: (r) => r.saveRatePct ?? -1, vis: (r) => fmtPct(r.saveRatePct) },
      { key: 'externalClickRatePct', label: 'External-click-rate', numeric: true, verdi: (r) => r.externalClickRatePct ?? -1, vis: (r) => fmtPct(r.externalClickRatePct) },
    ],
  }));
}


/* ========================
   G. LAGRINGSDYBDE
   ======================== */

function renderLagringsdybde(fordeling) {
  el.lagringsdybde.innerHTML = '';
  const bokser = [
    { nokkel: '0', tekst: '0 events lagret nå' },
    { nokkel: '1', tekst: '1 event' },
    { nokkel: '2', tekst: '2 events' },
    { nokkel: '3+', tekst: '3+ events' },
  ];
  const totalt = Math.max(1, ...Object.values(fordeling));

  for (const boks of bokser) {
    const antall = fordeling[boks.nokkel] ?? 0;
    const rad = document.createElement('div');
    rad.className = 'innsikt-funnel-rad';

    const etikett = document.createElement('div');
    etikett.className = 'innsikt-funnel-etikett';
    etikett.textContent = boks.tekst;

    const barWrap = document.createElement('div');
    barWrap.className = 'innsikt-funnel-bar-wrap';
    const bar = document.createElement('div');
    bar.className = 'innsikt-funnel-bar';
    bar.style.width = `${(antall / totalt) * 100}%`;
    barWrap.appendChild(bar);

    const tall = document.createElement('div');
    tall.className = 'innsikt-funnel-tall';
    tall.textContent = fmtTall(antall);

    rad.appendChild(etikett);
    rad.appendChild(barWrap);
    rad.appendChild(tall);
    el.lagringsdybde.appendChild(rad);
  }
}


/* ========================
   H. TRAFIKKILDER
   ======================== */

function renderKilder(sources) {
  el.kilder.innerHTML = '';
  el.kilder.appendChild(lagSorterbarTabell({
    defaultKey: 'brukere',
    rader: sources,
    tomTekst: 'Ingen sessions i denne perioden.',
    kolonner: [
      { key: 'kilde', label: 'Kilde', verdi: (r) => r.kilde },
      { key: 'brukere', label: 'Brukere', numeric: true, verdi: (r) => r.brukere },
      { key: 'eventaapnere', label: 'Eventåpnere', numeric: true, verdi: (r) => r.eventaapnere },
      { key: 'lagrere', label: 'Lagrere', numeric: true, verdi: (r) => r.lagrere },
      { key: 'videreklikk', label: 'Videreklikk', numeric: true, verdi: (r) => r.videreklikk },
      { key: 'aapnerRatePct', label: 'Åpner-rate', numeric: true, verdi: (r) => r.aapnerRatePct ?? -1, vis: (r) => fmtPct(r.aapnerRatePct) },
      { key: 'lagreRatePct', label: 'Lagre-rate', numeric: true, verdi: (r) => r.lagreRatePct ?? -1, vis: (r) => fmtPct(r.lagreRatePct) },
    ],
  }));
}


/* ========================
   I. RETENTION
   ======================== */

function renderRetention(retention) {
  el.retention.innerHTML = '';

  const kort = document.createElement('div');
  kort.className = 'innsikt-retention-kort';

  if (retention.forLiteData) {
    const p = document.createElement('p');
    p.className = 'tom-melding';
    p.textContent = `For lite data (${retention.nevner} kvalifiserte brukere så langt).`;
    kort.appendChild(p);
  } else {
    const verdi = document.createElement('div');
    verdi.className = 'innsikt-kpi-verdi';
    verdi.textContent = fmtPct(retention.prosent);
    const detalj = document.createElement('p');
    detalj.className = 'tom-melding';
    detalj.textContent = `${fmtTall(retention.teller)} av ${fmtTall(retention.nevner)} brukere som ble først sett minst 7 dager siden, startet en ny session innen 7 dager etter førstebesøket.`;
    kort.appendChild(verdi);
    kort.appendChild(detalj);
  }

  el.retention.appendChild(kort);
}


/* ========================
   ORKESTRERING
   ======================== */

function render(data) {
  sisteData = data;

  el.siden.textContent = data.metadata.firstAnalyticsEventAt
    ? `Produktdata samlet siden ${fmtDato(data.metadata.firstAnalyticsEventAt)}`
    : 'Ingen produktdata samlet ennå';

  el.liteData.hidden = !data.metadata.lavDatagrunnlag;

  renderKpi(data.summary);
  renderFunnel(data.funnel);
  renderTidsserie(data.timeseries);
  renderToppEvents(data.topEvents);
  renderKategoriEllerTag(el.kategorier, data.categories, 'kategori', 'Kategori');
  renderKategoriEllerTag(el.tags, data.tags, 'tag', 'Tag');
  renderLagringsdybde(data.saveDistribution);
  renderKilder(data.sources);
  renderRetention(data.retention);
}

export async function lastInnInnsikt() {
  el.last.hidden = false;
  el.innhold.hidden = true;
  el.feil.hidden = true;

  try {
    const data = await api.hentInnsikt(periode);
    el.last.hidden = true;
    el.innhold.hidden = false;
    render(data);
  } catch (err) {
    console.error('Kunne ikke hente innsikt:', err);
    el.last.hidden = true;
    el.feil.hidden = false;
    el.feilTekst.textContent = 'Prøv å laste fanen på nytt, eller sjekk at review-serveren kjører.';
    visFeil('Kunne ikke hente innsikt.');
  }
}

el.periodevelger?.querySelectorAll('.periode-knapp').forEach((knapp) => {
  if (knapp.dataset.periode === periode) knapp.classList.add('aktiv');
  knapp.addEventListener('click', () => {
    if (knapp.dataset.periode === periode) return;
    periode = knapp.dataset.periode;
    el.periodevelger.querySelectorAll('.periode-knapp').forEach((k) => k.classList.toggle('aktiv', k === knapp));
    lastInnInnsikt();
  });
});
