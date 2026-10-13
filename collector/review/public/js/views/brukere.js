/* brukere.js — «Brukere»-fanen: admin kan opprette og slette andre admin-
   brukere (onboarding uten å måtte kjøre scripts/opprett-bruker.mjs
   manuelt). Kun synlig/tilgjengelig for innlogget rolle 'admin' — se
   krevAdmin i server.js. */

import { api } from '../api.js';
import { visSuksess, visFeil } from '../toast.js';

const form = document.getElementById('brukere-form');
const feilEl = document.getElementById('brukere-feil');
const tabellEl = document.getElementById('brukere-tabell');

function fmtDato(iso) {
  if (!iso) return '–';
  return new Date(iso).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' });
}

export async function lastInnBrukere() {
  tabellEl.textContent = 'Laster…';

  let brukere;
  try {
    brukere = await api.hentBrukere();
  } catch (err) {
    tabellEl.textContent = 'Kunne ikke hente brukere.';
    return;
  }

  if (!Array.isArray(brukere)) {
    tabellEl.textContent = '';
    return;
  }

  const tabell = document.createElement('table');
  tabell.className = 'innsikt-tabell';
  tabell.innerHTML = `
    <thead><tr><th>E-post</th><th>Rolle</th><th>Opprettet</th><th>Sist innlogget</th><th></th></tr></thead>
  `;
  const tbody = document.createElement('tbody');

  brukere.forEach((bruker) => {
    const tr = document.createElement('tr');

    const tdEpost = document.createElement('td');
    tdEpost.textContent = bruker.email;

    const tdRolle = document.createElement('td');
    tdRolle.textContent = bruker.role;

    const tdOpprettet = document.createElement('td');
    tdOpprettet.textContent = fmtDato(bruker.created_at);

    const tdSistInn = document.createElement('td');
    tdSistInn.textContent = fmtDato(bruker.last_login_at);

    const tdSlett = document.createElement('td');
    const slettKnapp = document.createElement('button');
    slettKnapp.type = 'button';
    slettKnapp.className = 'knapp knapp-destruktiv';
    slettKnapp.textContent = 'Slett';
    slettKnapp.addEventListener('click', () => slett(bruker.id, bruker.email));
    tdSlett.appendChild(slettKnapp);

    tr.append(tdEpost, tdRolle, tdOpprettet, tdSistInn, tdSlett);
    tbody.appendChild(tr);
  });

  tabell.appendChild(tbody);
  tabellEl.replaceChildren(tabell);
}

async function slett(id, epost) {
  if (!confirm(`Slette brukeren ${epost}?`)) return;

  const svar = await api.slettBruker(id);
  if (!svar.ok) return visFeil(svar.feil ?? 'Kunne ikke slette bruker');

  visSuksess('Bruker slettet');
  lastInnBrukere();
}

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  feilEl.hidden = true;

  const epost = document.getElementById('brukere-epost').value.trim();
  const passord = document.getElementById('brukere-passord').value;
  const rolle = document.getElementById('brukere-rolle').value;

  const svar = await api.opprettBruker({ epost, passord, rolle });

  if (!svar.ok) {
    feilEl.textContent = svar.feil ?? 'Kunne ikke opprette bruker';
    feilEl.hidden = false;
    return;
  }

  visSuksess(`Bruker ${epost} opprettet`);
  form.reset();
  lastInnBrukere();
});
