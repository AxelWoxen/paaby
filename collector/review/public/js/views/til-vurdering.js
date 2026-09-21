/* til-vurdering.js — events collectoren (eller «+ Nytt event») har funnet,
   som venter på godkjenning. Viser candidates med source IN
   ('collector', 'manuell') — innsendinger fra arrangører vises i
   Innsendte-fanen (samme underliggende tabell, se server.js). */

import { erPassert } from '../oslo-tid.js';
import { lagKandidatKort } from './candidate-kort.js';

let alle = [];
let sokTekst = '';
let aktivKategori = 'alle';
let skjulPasserte = false;

const el = {
  feed: document.getElementById('vurdering-feed'),
  tom: document.getElementById('vurdering-tom'),
  teller: document.getElementById('vurdering-teller'),
  sok: document.getElementById('vurdering-sok'),
  skjulPasserte: document.getElementById('vurdering-skjul-passerte'),
  kategoriChips: document.querySelectorAll('#vurdering-filtre .kategori-filter-chip'),
};

function matcherSok(event) {
  if (!sokTekst) return true;
  const s = sokTekst.toLowerCase();
  return (event.tittel ?? '').toLowerCase().includes(s)
    || (event.sted ?? '').toLowerCase().includes(s);
}

function synlige() {
  return alle.filter((e) =>
    e._status === 'pending'
    && e._kilde !== 'innsending'
    && (aktivKategori === 'alle' || e.kategori === aktivKategori)
    && (!skjulPasserte || !erPassert(e))
    && matcherSok(e),
  );
}

function render() {
  const liste = synlige();
  el.feed.innerHTML = '';
  el.tom.hidden = liste.length > 0;

  const totalt = alle.filter((e) => e._status === 'pending' && e._kilde !== 'innsending').length;
  el.teller.textContent = liste.length === totalt
    ? `${totalt} til vurdering`
    : `${liste.length} av ${totalt} til vurdering`;

  liste
    .slice()
    .sort((a, b) => new Date(a.start) - new Date(b.start))
    .forEach((event) => {
      const { el: kortEl, lastInnBilde } = lagKandidatKort(event, { visInnsender: false });
      el.feed.appendChild(kortEl);
      void lastInnBilde;
    });
}

export function settCandidates(candidates) {
  alle = candidates;
  render();
}

export function tilVurderingAntall() {
  return alle.filter((e) => e._status === 'pending' && e._kilde !== 'innsending').length;
}

el.sok?.addEventListener('input', () => {
  sokTekst = el.sok.value.trim();
  render();
});

el.skjulPasserte?.addEventListener('change', () => {
  skjulPasserte = el.skjulPasserte.checked;
  render();
});

el.kategoriChips?.forEach((chip) => {
  chip.addEventListener('click', () => {
    el.kategoriChips.forEach((c) => c.classList.remove('aktiv'));
    chip.classList.add('aktiv');
    aktivKategori = chip.dataset.filter;
    render();
  });
});
