/* til-vurdering.js — siste steg før publisering. Viser:
   - manuelt lagt inn (source='manuell', status='pending') — rett fra
     «Nytt event», ikke sett av noen ennå.
   - triagerte collector-funn (status='triaged') — sendt hit fra
     «Fra API» (views/fra-api.js) etter en første gjennomgang.
   Rå, ikke-triagerte collector-funn hører hjemme i Fra API, ikke her — det
   er hele poenget med triage-steget: alt i denne lista er allerede sett
   gjennom én gang. Innsendinger fra arrangører vises i Innsendte-fanen
   (samme underliggende tabell, se server.js). */

import { api } from '../api.js';
import { visSuksess, visFeil } from '../toast.js';
import { bekreft } from '../confirm.js';
import { erPassert } from '../oslo-tid.js';
import { lagKandidatKort } from './candidate-kort.js';
import { visIBolker } from '../ui-helpers.js';

let alle = [];
let sokTekst = '';
let aktivKategori = 'alle';
let skjulPasserte = true; // matcher HTML-checkboxens `checked` — bevisst på som standard

const el = {
  feed: document.getElementById('vurdering-feed'),
  tom: document.getElementById('vurdering-tom'),
  teller: document.getElementById('vurdering-teller'),
  sok: document.getElementById('vurdering-sok'),
  skjulPasserte: document.getElementById('vurdering-skjul-passerte'),
  kategoriChips: document.querySelectorAll('#vurdering-filtre .kategori-filter-chip'),
  avslaaPasserte: document.getElementById('vurdering-avslaa-passerte'),
};

function grunnlisten() {
  return alle.filter((e) =>
    e._status === 'triaged'
    || (e._status === 'pending' && e._kilde === 'manuell'),
  );
}

function matcherSok(event) {
  if (!sokTekst) return true;
  const s = sokTekst.toLowerCase();
  return (event.tittel ?? '').toLowerCase().includes(s)
    || (event.sted ?? '').toLowerCase().includes(s);
}

function synlige() {
  return grunnlisten().filter((e) =>
    (aktivKategori === 'alle' || e.kategori === aktivKategori)
    && (!skjulPasserte || !erPassert(e))
    && matcherSok(e),
  );
}

function oppdaterTeller(liste) {
  const totalt = grunnlisten();
  const passerteTotalt = totalt.filter(erPassert).length;
  const kommendeTotalt = totalt.length - passerteTotalt;
  const harFilter = aktivKategori !== 'alle' || sokTekst !== '';

  if (!harFilter) {
    el.teller.textContent = skjulPasserte
      ? `${kommendeTotalt} kommende${passerteTotalt ? ` · ${passerteTotalt} passerte skjult` : ''}`
      : `${totalt.length} til vurdering`;
  } else {
    el.teller.textContent = `${liste.length} av ${totalt.length} til vurdering`;
  }

  if (el.avslaaPasserte) el.avslaaPasserte.hidden = passerteTotalt === 0;
}

function render(nullstill = false) {
  const liste = synlige();
  el.feed.innerHTML = '';
  el.tom.hidden = liste.length > 0;
  oppdaterTeller(liste);

  const sortert = liste.slice().sort((a, b) => new Date(a.start) - new Date(b.start));
  visIBolker(el.feed, sortert, (event) => {
    el.feed.appendChild(lagKandidatKort(event, { visInnsender: false }).el);
  }, { nullstill });
}

export function settCandidates(candidates) {
  alle = candidates;
  render();
}

export function tilVurderingAntall() {
  return grunnlisten().length;
}

el.sok?.addEventListener('input', () => {
  sokTekst = el.sok.value.trim();
  render(true);
});

el.skjulPasserte?.addEventListener('change', () => {
  skjulPasserte = el.skjulPasserte.checked;
  render(true);
});

el.kategoriChips?.forEach((chip) => {
  chip.addEventListener('click', () => {
    el.kategoriChips.forEach((c) => c.classList.remove('aktiv'));
    chip.classList.add('aktiv');
    aktivKategori = chip.dataset.filter;
    render(true);
  });
});

// Bulk-avslå passerte kandidater. Kaller det EKSISTERENDE avslå-endepunktet
// én kandidat om gangen (ingen ny backendlogikk) — viser fremdrift underveis
// siden dette kan være 100+ kall, og oppsummerer til slutt.
el.avslaaPasserte?.addEventListener('click', async () => {
  const passerte = grunnlisten().filter(erPassert);
  if (passerte.length === 0) return;

  const ok = await bekreft({
    tittel: `Avslå ${passerte.length} passerte kandidater?`,
    tekst: 'De fjernes fra listen permanent og foreslås ikke på nytt. Dette kan ikke angres samlet.',
    bekreftTekst: 'Avslå alle',
  });
  if (!ok) return;

  el.avslaaPasserte.disabled = true;
  let lyktes = 0;
  let feilet = 0;

  for (let i = 0; i < passerte.length; i++) {
    el.avslaaPasserte.textContent = `Avslår ${i + 1} av ${passerte.length} …`;
    const data = await api.avslaa(passerte[i].id);
    if (data.ok) {
      passerte[i]._status = 'avslatt';
      lyktes++;
    } else {
      feilet++;
    }
  }

  el.avslaaPasserte.disabled = false;
  el.avslaaPasserte.textContent = 'Avslå alle passerte';

  if (feilet === 0) {
    visSuksess(`${lyktes} passerte kandidater avslått.`);
  } else {
    visFeil(`${lyktes} avslått, ${feilet} feilet. Prøv igjen for de som feilet.`);
  }

  document.dispatchEvent(new CustomEvent('paaby:candidates-endret'));
});
