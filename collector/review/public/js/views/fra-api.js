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
import { lagListeKontroller } from '../liste-kontroller.js';
import { visIBolker } from '../ui-helpers.js';

let alle = [];
let sokTekst = '';
let aktivKategori = 'alle';
let skjulPasserte = true;
let aktivtUtvalg = 'valgt';

const el = {
  feed: document.getElementById('fra-api-feed'),
  tom: document.getElementById('fra-api-tom'),
  teller: document.getElementById('fra-api-teller'),
  sok: document.getElementById('fra-api-sok'),
  skjulPasserte: document.getElementById('fra-api-skjul-passerte'),
  kategoriChips: document.querySelectorAll('#fra-api-filtre .kategori-filter-chip'),
  avslaaPasserte: document.getElementById('fra-api-avslaa-passerte'),
  utvalgChips: document.querySelectorAll('#fra-api-utvalg .kategori-filter-chip'),
  utvalgForklaring: document.getElementById('fra-api-utvalg-forklaring'),
};

// Mest relevant: agentens score først (uten score sist) — liste-kontroller
// faller tilbake på dato ved lik score.
function etterRelevans(a, b) {
  const sa = typeof a._interesse === 'number' ? a._interesse : -1;
  const sb = typeof b._interesse === 'number' ? b._interesse : -1;
  return sb - sa;
}

const kontroller = lagListeKontroller(el.sok.closest('.verktoylinje'), {
  lagtTil: (e) => e._lagtTil,
  onEndring: () => render(true),
  ekstraSorteringer: [['relevans', 'Mest relevant', etterRelevans]],
});

function grunnlisten() {
  return alle.filter((e) => e._status === 'pending' && e._kilde === 'collector');
}

function matcherSok(event) {
  if (!sokTekst) return true;
  const s = sokTekst.toLowerCase();
  return (event.tittel ?? '').toLowerCase().includes(s)
    || (event.sted ?? '').toLowerCase().includes(s);
}

// Agenten (collector/run.js) deler funnene i tre grupper (_agentValg, se
// core/interesse.js:agentensValg): utvalget, usikre og ikke valgt. Alle
// ligger fortsatt her som pending — «Usikre»/«Ikke valgt» viser det
// agenten la til side, og «Legg i utvalget» flytter det tilbake.
const UTVALG_FORKLARING = {
  'valgt': 'Det agenten tror er verdt å se på (relevans 40+), det du har lagt til selv, og alt uten score ennå.',
  'usikker': 'Agenten heller ingen vei (relevans 25–39). Før du har avslått 5 events selv, havner også lav relevans her i stedet for under «Ikke valgt». «Legg i utvalget» flytter eventet til agentens utvalg.',
  'ikke-valgt': 'Lav relevans (under 25) eller holdt ute av en regel. «Legg i utvalget» flytter eventet tilbake, og agenten holder det ikke ute igjen.',
};

function iUtvalg(e) {
  return (e._agentValg ?? 'valgt') === aktivtUtvalg;
}

function synlige() {
  return kontroller.filtrer(grunnlisten()).filter((e) =>
    (aktivKategori === 'alle' || e.kategori === aktivKategori)
    && (!skjulPasserte || !erPassert(e))
    && iUtvalg(e)
    && matcherSok(e),
  );
}

function oppdaterTeller(liste) {
  const totalt = grunnlisten();
  const passerteTotalt = totalt.filter(erPassert).length;
  const kommendeTotalt = totalt.length - passerteTotalt;
  const harFilter = aktivKategori !== 'alle' || sokTekst !== '' || kontroller.erFiltrert();

  if (!harFilter) {
    el.teller.textContent = skjulPasserte
      ? `${kommendeTotalt} nye${passerteTotalt ? ` · ${passerteTotalt} passerte skjult` : ''}`
      : `${totalt.length} fra API`;
  } else {
    el.teller.textContent = `${liste.length} av ${totalt.length} fra API`;
  }

  if (el.avslaaPasserte) el.avslaaPasserte.hidden = passerteTotalt === 0;

  if (el.utvalgForklaring) el.utvalgForklaring.textContent = UTVALG_FORKLARING[aktivtUtvalg];

  const kommende = totalt.filter((e) => !skjulPasserte || !erPassert(e));
  el.utvalgChips?.forEach((chip) => {
    const antall = kommende.filter((e) => (e._agentValg ?? 'valgt') === chip.dataset.utvalg).length;
    chip.querySelector('.utvalg-antall').textContent = `(${antall})`;
  });
}

function render(nullstill = false) {
  const liste = synlige();
  el.feed.innerHTML = '';
  el.tom.hidden = liste.length > 0;
  oppdaterTeller(liste);

  visIBolker(el.feed, kontroller.sorter(liste), (event) => {
    el.feed.appendChild(lagKandidatKort(event, {
      visInnsender: false,
      modus: 'fra-api',
      onInkludert: () => render(),
    }).el);
  }, { nullstill });
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
  render(true);
});

el.skjulPasserte?.addEventListener('change', () => {
  skjulPasserte = el.skjulPasserte.checked;
  render(true);
});

el.utvalgChips?.forEach((chip) => {
  chip.addEventListener('click', () => {
    el.utvalgChips.forEach((c) => c.classList.remove('aktiv'));
    chip.classList.add('aktiv');
    aktivtUtvalg = chip.dataset.utvalg;
    render(true);
  });
});

el.kategoriChips?.forEach((chip) => {
  chip.addEventListener('click', () => {
    el.kategoriChips.forEach((c) => c.classList.remove('aktiv'));
    chip.classList.add('aktiv');
    aktivKategori = chip.dataset.filter;
    render(true);
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
    const data = await api.avslaa(passerte[i].id, 'passert');
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
