/* innsendte.js — events sendt inn av arrangører via /send-inn/.
   Samme candidate-tabell som Til vurdering, filtrert på source='innsending'
   (se collector/store/candidates-db.js — _kilde speiler kolonnen source). */

import { lagKandidatKort } from './candidate-kort.js';
import { visIBolker } from '../ui-helpers.js';

let alle = [];
let sokTekst = '';

const el = {
  feed: document.getElementById('innsendte-feed'),
  tom: document.getElementById('innsendte-tom'),
  teller: document.getElementById('innsendte-teller'),
  fanetTeller: document.getElementById('innsendte-fane-teller'),
  sok: document.getElementById('innsendte-sok'),
};

function synlige() {
  const s = sokTekst.toLowerCase();
  return alle.filter((e) =>
    e._status === 'pending'
    && e._kilde === 'innsending'
    && (!s || (e.tittel ?? '').toLowerCase().includes(s) || (e.sted ?? '').toLowerCase().includes(s)),
  );
}

function render(nullstill = false) {
  const liste = synlige();
  el.feed.innerHTML = '';
  el.tom.hidden = liste.length > 0;

  const totalt = alle.filter((e) => e._status === 'pending' && e._kilde === 'innsending').length;
  el.teller.textContent = liste.length === totalt
    ? `${totalt} ventende innsendinger`
    : `${liste.length} av ${totalt} ventende innsendinger`;
  if (el.fanetTeller) el.fanetTeller.textContent = String(totalt);

  const sortert = liste.slice().sort((a, b) => new Date(a.start) - new Date(b.start));
  visIBolker(el.feed, sortert, (event) => {
    el.feed.appendChild(lagKandidatKort(event, { visInnsender: true }).el);
  }, { nullstill });
}

export function settCandidates(candidates) {
  alle = candidates;
  render();
}

export function innsendteAntall() {
  return alle.filter((e) => e._status === 'pending' && e._kilde === 'innsending').length;
}

el.sok?.addEventListener('input', () => {
  sokTekst = el.sok.value.trim();
  render(true);
});
