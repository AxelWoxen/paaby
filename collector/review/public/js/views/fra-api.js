/* fra-api.js — rå, ikke-triagerte funn fra collectoren (source='collector',
   status='pending'). Dette er FØRSTE stopp for alt collectoren finner
   automatisk — blandes bevisst ikke med manuelt lagt inn eller allerede
   gjennomgåtte events (se views/til-vurdering.js).

   "Godkjenn" her betyr IKKE publisering. Den sender candidaten videre til
   Til vurdering (status settes til 'triaged' via /api/triager/:id) — samme
   candidate-rad i databasen, bare et statusskifte. Faktisk publisering
   skjer først når Til vurdering-fanen godkjenner. */

import { api } from '../api.js';
import { visSuksess, visFeil } from '../toast.js';
import { bekreft } from '../confirm.js';
import { erPassert } from '../oslo-tid.js';
import { lagKandidatKort } from './candidate-kort.js';

let alle = [];
let sokTekst = '';
let aktivKategori = 'alle';
let skjulPasserte = true;

const el = {
  feed: document.getElementById('fra-api-feed'),
  tom: document.getElementById('fra-api-tom'),
  teller: document.getElementById('fra-api-teller'),
  sok: document.getElementById('fra-api-sok'),
  skjulPasserte: document.getElementById('fra-api-skjul-passerte'),
  kategoriChips: document.querySelectorAll('#fra-api-filtre .kategori-filter-chip'),
  avslaaPasserte: document.getElementById('fra-api-avslaa-passerte'),
};

function grunnlisten() {
  return alle.filter((e) => e._status === 'pending' && e._kilde === 'collector');
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
      ? `${kommendeTotalt} nye${passerteTotalt ? ` · ${passerteTotalt} passerte skjult` : ''}`
      : `${totalt.length} fra API`;
  } else {
    el.teller.textContent = `${liste.length} av ${totalt.length} fra API`;
  }

  if (el.avslaaPasserte) el.avslaaPasserte.hidden = passerteTotalt === 0;
}

function render() {
  const liste = synlige();
  el.feed.innerHTML = '';
  el.tom.hidden = liste.length > 0;
  oppdaterTeller(liste);

  liste
    .slice()
    .sort((a, b) => new Date(a.start) - new Date(b.start))
    .forEach((event) => {
      const { el: kortEl, lastInnBilde } = lagKandidatKort(event, { visInnsender: false, modus: 'fra-api' });
      el.feed.appendChild(kortEl);
      void lastInnBilde;
    });
}

export function settCandidates(candidates) {
  alle = candidates;
  render();
}

export function fraApiAntall() {
  return grunnlisten().length;
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

// Bulk-avslå passerte, rene collector-funn — samme mønster som Til
// vurdering sin «Avslå alle passerte» (kaller eksisterende /api/avslaa/:id
// én og én, viser fremdrift, oppsummerer).
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
