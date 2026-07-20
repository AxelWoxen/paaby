/* forside.js — redaksjonell forside.
   Viser kuratert utvalg: fremhevede events øverst, fallback fyller opp til 5. */

import { osloKomponenter }                        from '../application/oslo-tid.js';
import { formaterTid, formaterPrisTekst,
         kategoriVisningsnavn }                   from '../application/formatering.js';
import { hentEventbilde }                         from '../application/kategori-bilder.js';
import { åpneModal }                             from './modal.js';

const MAKS = 5;

/* ─── Hilsen ─────────────────────────────────────────────────────────────────── */

function hentGreeting(time) {
  if (time >= 5  && time < 11) return ['God morgen',       'Her er det vi tror du vil like til uka'];
  if (time >= 11 && time < 17) return ['God ettermiddag',  'Her er noe å se frem til'];
  return                               ['God kveld',        'Her er det vi tror du vil like'];
}

/* ─── Utvalg ─────────────────────────────────────────────────────────────────── */

function eventScore(event, osloTime, nå) {
  const start = new Date(event.start);
  if (start <= nå) return Infinity;

  const k   = osloKomponenter(start);
  const kNå = osloKomponenter(nå);

  // Dager fra i dag (0 = i dag, 1 = i morgen, ...)
  const dagStart = new Date(`${k.år}-${String(k.maned).padStart(2,'0')}-${String(k.dag).padStart(2,'0')}T00:00:00+02:00`);
  const dagNå    = new Date(`${kNå.år}-${String(kNå.maned).padStart(2,'0')}-${String(kNå.dag).padStart(2,'0')}T00:00:00+02:00`);
  const dager    = Math.round((dagStart - dagNå) / 86_400_000);

  let s = dager * 1000 + k.time * 10;

  // Kveld (≥ 17:00): boost kveldseventer (start ≥ 18:00) som er i dag
  if (osloTime >= 17 && dager === 0 && k.time >= 18) s -= 500;

  // Dagtid (< 17:00): boost påfunn og mat i dag
  if (osloTime < 17 && dager === 0 &&
      (event.kategori === 'pafunn' || event.kategori === 'mat')) s -= 300;

  return s;
}

export function velgUtvalg(alleEventer) {
  const nå      = new Date();
  const time    = osloKomponenter(nå).time;

  const fremhevede = alleEventer
    .filter(e => e.fremhevet && new Date(e.start) > nå)
    .sort((a, b) => new Date(a.start) - new Date(b.start));

  const fremhevedeIder = new Set(fremhevede.map(e => e.id));

  const fallback = alleEventer
    .filter(e => !fremhevedeIder.has(e.id))
    .map(e => ({ event: e, s: eventScore(e, time, nå) }))
    .filter(x => x.s < Infinity)
    .sort((a, b) => a.s - b.s)
    .map(x => x.event);

  return [...fremhevede, ...fallback].slice(0, MAKS);
}

/* ─── Render ─────────────────────────────────────────────────────────────────── */

function lagUtvalgKort(event) {
  const el = document.createElement('article');
  el.className = 'utvalg-kort';
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  el.setAttribute('aria-label', `Åpne detaljer for ${event.tittel}`);

  // Bildewrapper
  const bildeWrapper = document.createElement('div');
  bildeWrapper.className = 'utvalg-bilde-wrapper';

  const bilde = document.createElement('img');
  bilde.className = 'utvalg-bilde';
  bilde.src       = hentEventbilde(event);
  bilde.alt       = '';
  bilde.loading   = 'lazy';
  bilde.addEventListener('error', () => bilde.remove(), { once: true });
  bildeWrapper.appendChild(bilde);

  // Badge-rad
  const badgeRad = document.createElement('div');
  badgeRad.className = 'utvalg-badge-rad';

  const katBadge = document.createElement('span');
  katBadge.className   = `utvalg-badge kategori-${event.kategori}`;
  katBadge.textContent = kategoriVisningsnavn(event.kategori);
  badgeRad.appendChild(katBadge);

  if (event.fremhevet) {
    const fremBadge = document.createElement('span');
    fremBadge.className   = 'utvalg-fremhevet-badge';
    fremBadge.textContent = '★ Kuratert utvalg';
    badgeRad.appendChild(fremBadge);
  }

  bildeWrapper.appendChild(badgeRad);
  el.appendChild(bildeWrapper);

  // Innhold
  const innhold = document.createElement('div');
  innhold.className = 'utvalg-innhold';

  const tittel = document.createElement('h2');
  tittel.className   = 'utvalg-tittel';
  tittel.textContent = event.tittel;
  innhold.appendChild(tittel);

  const meta = document.createElement('p');
  meta.className   = 'utvalg-meta';
  meta.textContent = `${event.sted}  ·  ${formaterTid(event.start)}  ·  ${formaterPrisTekst(event.pris, event.prisTekst)}`;
  innhold.appendChild(meta);

  if (event.kuratortekst) {
    const kur = document.createElement('p');
    kur.className   = 'utvalg-kuratortekst';
    kur.textContent = `"${event.kuratortekst}"`;
    innhold.appendChild(kur);
  }

  el.appendChild(innhold);

  const åpne = () => åpneModal(event);
  el.addEventListener('click', åpne);
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); åpne(); }
  });

  return el;
}

/* ─── Offentlig API ──────────────────────────────────────────────────────────── */

export function visForside(utvalg) {
  const nå   = new Date();
  const time = osloKomponenter(nå).time;
  const [tittel, undertittel] = hentGreeting(time);

  document.getElementById('forside-tittel').textContent     = tittel;
  document.getElementById('forside-undertittel').textContent = undertittel;

  const utvalgEl = document.getElementById('forside-utvalg');
  utvalgEl.innerHTML = '';
  utvalg.forEach(e => utvalgEl.appendChild(lagUtvalgKort(e)));
}

export function initSeAlt() {
  const knapp  = document.getElementById('se-alt-knapp');
  const scroll = () => document.getElementById('hoveddel').scrollIntoView({ behavior: 'smooth' });
  knapp.addEventListener('click', scroll);

  // Flytende pill: separat element i body, aldri i dokumentflyten
  const pill = document.createElement('button');
  pill.className   = 'se-alt-flytende';
  pill.textContent = knapp.textContent.trim();
  pill.setAttribute('aria-label', 'Scroll til full arrangementsliste');
  pill.addEventListener('click', scroll);
  document.body.appendChild(pill);

  // Vis pill kun når knappen er UNDER viewport (ikke nådd ennå).
  // Hvis knappen er OVER viewport (scrollet forbi), skjul pillen.
  const observer = new IntersectionObserver(
    ([entry]) => {
      const erUnder = entry.boundingClientRect.top > 0;
      pill.classList.toggle('vis', !entry.isIntersecting && erUnder);
    },
    { threshold: 0 }
  );
  observer.observe(knapp);
}
