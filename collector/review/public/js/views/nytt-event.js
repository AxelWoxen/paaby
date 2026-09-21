/* nytt-event.js — manuell eventopprettelse. Går rett til candidates (samme
   /api/manuell-endepunkt som før) og må godkjennes i «Til vurdering» før
   det er live — akkurat som collector-funn. Kuratortekst/fremheving settes
   IKKE her, siden /api/manuell ikke tar imot disse feltene i dag; de settes
   ved godkjenning i Til vurdering-fanen (se candidate-kort.js). */

import { api } from '../api.js';
import { visSuksess, visFeil } from '../toast.js';
import { lagGjentasKontroll } from '../gjentas-ui.js';

const felt = {
  tittel: document.getElementById('ny-tittel'),
  start: document.getElementById('ny-start'),
  slutt: document.getElementById('ny-slutt'),
  sted: document.getElementById('ny-sted'),
  adresse: document.getElementById('ny-adresse'),
  pris: document.getElementById('ny-pris'),
  prisTekst: document.getElementById('ny-pristekst'),
  beskrivelse: document.getElementById('ny-beskrivelse'),
  lenke: document.getElementById('ny-lenke'),
  bilde: document.getElementById('ny-bilde'),
};

const kategoriKnapper = document.querySelectorAll('#ny-kategori-velger .kategori-chip');
const gjentasHost  = document.getElementById('ny-gjentas-host');
const submitKnapp  = document.getElementById('ny-submit');
const feilBoks     = document.getElementById('ny-feil');
const form         = document.getElementById('nytt-event-form');

let aktivKategori = 'musikk';
let gjentasKontroll = null;

function initGjentas() {
  if (!gjentasHost) return;
  gjentasKontroll = lagGjentasKontroll(null);
  gjentasHost.innerHTML = '';
  gjentasHost.appendChild(gjentasKontroll.el);
}

kategoriKnapper.forEach((btn) => {
  btn.addEventListener('click', () => {
    kategoriKnapper.forEach((k) => k.classList.remove('aktiv'));
    btn.classList.add('aktiv');
    aktivKategori = btn.dataset.kat;
  });
});

function visFeilmelding(tekst) {
  feilBoks.textContent = tekst;
  feilBoks.hidden = false;
}

function nullstillFeil() {
  feilBoks.hidden = true;
  feilBoks.textContent = '';
}

function tomSkjema() {
  Object.values(felt).forEach((input) => { if (input) input.value = ''; });
  kategoriKnapper.forEach((k, i) => k.classList.toggle('aktiv', i === 0));
  aktivKategori = kategoriKnapper[0]?.dataset.kat ?? 'musikk';
  initGjentas();
}

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  nullstillFeil();

  const tittel = felt.tittel.value.trim();
  const start  = felt.start.value.trim();

  if (!tittel || !start) {
    visFeilmelding('Tittel og starttidspunkt er påkrevd.');
    return;
  }

  submitKnapp.disabled = true;
  submitKnapp.textContent = '…';

  const data = await api.leggTilManuelt({
    tittel,
    kategori: aktivKategori,
    start,
    slutt: felt.slutt.value.trim() || null,
    sted: felt.sted.value.trim() || null,
    adresse: felt.adresse.value.trim() || null,
    pris: felt.pris.value.trim() || null,
    prisTekst: felt.prisTekst.value.trim() || null,
    beskrivelse: felt.beskrivelse.value.trim() || null,
    lenke: felt.lenke.value.trim() || null,
    bilde: felt.bilde.value.trim() || null,
    gjentas: gjentasKontroll?.hentVerdi() ?? null,
  });

  submitKnapp.disabled = false;
  submitKnapp.textContent = 'Legg til — send til vurdering';

  if (data.ok) {
    visSuksess(`«${tittel}» er lagt til i Til vurdering.`);
    tomSkjema();
    document.dispatchEvent(new CustomEvent('paaby:candidates-endret'));
  } else {
    visFeilmelding(data.feil ?? 'Ukjent feil.');
    visFeil(data.feil ?? 'Kunne ikke legge til eventet.');
  }
});

initGjentas();
