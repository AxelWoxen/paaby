/* main.js — navigasjon, oppstart og miljø-indikator for Påby Admin. */

import { api } from './api.js';
import { visFeil } from './toast.js';
import * as tilVurdering from './views/til-vurdering.js';
import * as innsendte from './views/innsendte.js';
import * as publiserte from './views/publiserte.js';
import './views/nytt-event.js';

const faner = document.querySelectorAll('.fane-knapp');
const paneler = {
  'til-vurdering': document.getElementById('panel-til-vurdering'),
  innsendte: document.getElementById('panel-innsendte'),
  publiserte: document.getElementById('panel-publiserte'),
  'nytt-event': document.getElementById('panel-nytt-event'),
};

function byttFane(navn) {
  faner.forEach((f) => f.classList.toggle('aktiv', f.dataset.fane === navn));
  Object.entries(paneler).forEach(([n, el]) => { if (el) el.hidden = n !== navn; });
  if (navn === 'publiserte') publiserte.lastInnPubliserte();
  history.replaceState(null, '', `#${navn}`);
}

faner.forEach((f) => f.addEventListener('click', () => byttFane(f.dataset.fane)));

const startFane = location.hash.replace('#', '') || 'til-vurdering';
byttFane(paneler[startFane] ? startFane : 'til-vurdering');

// ─── Miljø-badge ────────────────────────────────────────────────────────────
// Robust signal: NODE_ENV settes eksplisitt av `npm run review:prod`
// (collector/package.json) og leses her fra samme prosess som eier
// databasetilkoblingen — ingen gjetting.
async function visMiljo() {
  const badge = document.getElementById('miljo-badge');
  if (!badge) return;
  const { produksjon, ukjent } = await api.miljo();
  if (ukjent) {
    badge.hidden = true;
    return;
  }
  badge.textContent = produksjon ? '● PRODUKSJON' : '● LOKAL';
  badge.className = `miljo-badge ${produksjon ? 'miljo-produksjon' : 'miljo-lokal'}`;
  badge.hidden = false;
}

// ─── Candidates (Til vurdering + Innsendte deler samme kilde) ──────────────
async function lastInnCandidates() {
  try {
    const candidates = await api.hentCandidates();
    candidates.forEach((e) => { e._fremhevet = false; });
    tilVurdering.settCandidates(candidates);
    innsendte.settCandidates(candidates);
    oppdaterFaneTeller();
  } catch (err) {
    console.error('Kunne ikke hente candidates:', err);
    visFeil('Kunne ikke hente events til vurdering. Prøv å laste siden på nytt.');
  }
}

function oppdaterFaneTeller() {
  const innsendteEl = document.getElementById('fane-teller-innsendte');
  if (innsendteEl) innsendteEl.textContent = String(innsendte.innsendteAntall());
  const vurderingEl = document.getElementById('fane-teller-til-vurdering');
  if (vurderingEl) vurderingEl.textContent = String(tilVurdering.tilVurderingAntall());
}

document.addEventListener('paaby:candidates-endret', lastInnCandidates);

// ─── Innlogget som ──────────────────────────────────────────────────────────
async function visInnloggetSom() {
  const el = document.getElementById('innlogget-som');
  if (!el) return;
  const { epost } = await api.meg();
  el.textContent = epost ?? '';
}

async function start() {
  visMiljo();
  visInnloggetSom();
  await Promise.all([
    lastInnCandidates(),
    publiserte.lastInnPubliserte(),
  ]);
}

start();
