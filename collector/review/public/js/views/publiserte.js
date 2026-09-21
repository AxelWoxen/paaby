/* publiserte.js — live events i Påby. Data hentes rett fra Postgres via
   GET /api/publiserte (collector/store/published.js) — samme spørring og
   samme felt som før. Gjentakende events vises med NESTE forekomst
   (medNesteForekomst i server.js), grunn-eventets id beholdes til
   fremhev/deaktiver/rediger/gjentas-endepunktene. */

import { api } from '../api.js';
import { visSuksess, visFeil } from '../toast.js';
import { bekreft } from '../confirm.js';
import { formaterDato, eventTilstand, datetimeLocalTilOsloISO, osloKomponenter, lagOsloDato } from '../oslo-tid.js';
import { lagGjentasKontroll } from '../gjentas-ui.js';
import { lagRedigeringsFelter } from '../ui-helpers.js';

let alle = [];
let lastet = false;
let sokTekst = '';
let kunFremhevet = false;
let visDeaktiverte = false;

const el = {
  feed: document.getElementById('publiserte-feed'),
  tom: document.getElementById('publiserte-tom'),
  teller: document.getElementById('publiserte-teller'),
  sok: document.getElementById('publiserte-sok'),
  kunFremhevet: document.getElementById('publiserte-kun-fremhevet'),
  visDeaktiverte: document.getElementById('publiserte-vis-deaktiverte'),
};

function synlige() {
  const s = sokTekst.toLowerCase();
  return alle.filter((e) => {
    if (eventTilstand(e.start) === 'ferdig') return false;
    if (!visDeaktiverte && e.deaktivert) return false;
    if (kunFremhevet && !e.fremhevet) return false;
    if (s && !(e.tittel ?? '').toLowerCase().includes(s) && !(e.sted ?? '').toLowerCase().includes(s)) return false;
    return true;
  });
}

function render() {
  const liste = synlige().sort((a, b) => new Date(a.start) - new Date(b.start));
  el.feed.innerHTML = '';
  el.tom.hidden = liste.length > 0;
  el.teller.textContent = `${liste.length} av ${alle.length} kommende publiserte`;
  liste.forEach((event) => el.feed.appendChild(lagPubKort(event)));
}

function lagPubKort(event) {
  const kort = document.createElement('div');
  kort.className = `pub-kort${event.fremhevet ? ' er-fremhevet' : ''}${event.deaktivert ? ' er-deaktivert' : ''}`;
  kort.dataset.id = event.id;

  const hoved = document.createElement('div');
  hoved.className = 'pub-hoved';

  const infoDel = document.createElement('div');
  infoDel.className = 'pub-info';

  const badge = document.createElement('span');
  badge.className = `badge badge-${event.kategori}`;
  badge.textContent = event.kategori;

  const tittel = document.createElement('div');
  tittel.className = 'pub-tittel';
  tittel.textContent = `${event.fremhevet ? '★ ' : ''}${event.tittel}`;

  const topprad = document.createElement('div');
  topprad.className = 'pub-topprad';
  topprad.appendChild(badge);
  topprad.appendChild(tittel);
  infoDel.appendChild(topprad);

  const m = document.createElement('div');
  m.className = 'pub-meta';
  m.textContent = `${event.sted ?? '—'} · ${formaterDato(event.start)}${event.deaktivert ? ' · deaktivert' : ''}`;
  infoDel.appendChild(m);

  const fKnapp = document.createElement('button');
  fKnapp.type = 'button';
  fKnapp.className = `knapp-stjerne${event.fremhevet ? ' aktiv' : ''}`;
  fKnapp.textContent = '★';
  fKnapp.title = event.fremhevet ? 'Fjern fremheving' : 'Fremhev';
  fKnapp.setAttribute('aria-pressed', String(!!event.fremhevet));

  fKnapp.onclick = async () => {
    fKnapp.disabled = true;
    const data = await api.fremhev(event.id);
    fKnapp.disabled = false;
    if (data.ok) {
      event.fremhevet = data.fremhevet;
      fKnapp.classList.toggle('aktiv', data.fremhevet);
      fKnapp.setAttribute('aria-pressed', String(data.fremhevet));
      fKnapp.title = data.fremhevet ? 'Fjern fremheving' : 'Fremhev';
      kort.classList.toggle('er-fremhevet', data.fremhevet);
      tittel.textContent = `${data.fremhevet ? '★ ' : ''}${event.tittel}`;
      visSuksess(data.fremhevet ? `«${event.tittel}» er fremhevet.` : `Fremheving fjernet fra «${event.tittel}».`);
      oppdaterTeller();
    } else {
      visFeil(data.feil ?? 'Kunne ikke endre fremheving.');
    }
  };

  // Gjentas-rad
  const gjKontroll = lagGjentasKontroll(event.gjentas ?? null);
  gjKontroll.el.className = 'pub-gjentas-rad';
  const gjStatus = document.createElement('span');
  gjStatus.className = 'gjentas-status';
  gjKontroll.el.appendChild(gjStatus);

  gjKontroll.el.querySelectorAll('select').forEach((select) => {
    select.addEventListener('change', async () => {
      gjStatus.textContent = '…';
      const data = await api.oppdaterGjentas(event.id, gjKontroll.hentVerdi());
      if (data.ok) {
        event.gjentas = data.gjentas;
        gjStatus.textContent = '✓';
        visSuksess('Gjentakelse oppdatert.');
      } else {
        gjStatus.textContent = '!';
        visFeil(data.feil ?? 'Kunne ikke oppdatere gjentakelse.');
      }
      setTimeout(() => { gjStatus.textContent = ''; }, 1800);
    });
  });

  const kortInnhold = document.createElement('div');
  kortInnhold.className = 'pub-innhold';
  kortInnhold.appendChild(infoDel);
  kortInnhold.appendChild(gjKontroll.el);

  hoved.appendChild(kortInnhold);
  hoved.appendChild(fKnapp);
  kort.appendChild(hoved);

  // Rediger + deaktiver
  const redigerKnapp = document.createElement('button');
  redigerKnapp.type = 'button';
  redigerKnapp.className = 'lenke-knapp';
  redigerKnapp.textContent = '✎ Rediger';

  const dKnapp = document.createElement('button');
  dKnapp.type = 'button';
  dKnapp.className = `lenke-knapp lenke-knapp-faresone${event.deaktivert ? ' aktiv' : ''}`;
  dKnapp.textContent = event.deaktivert ? '↺ Aktiver igjen' : '🚫 Deaktiver';

  const redigering = lagRedigeringsFelter(event);
  const redigerPanel = document.createElement('div');
  redigerPanel.className = 'pub-rediger-panel';
  redigerPanel.hidden = true;
  redigerPanel.appendChild(redigering.el);

  const lagreStatus = document.createElement('div');
  lagreStatus.className = 'lagre-status';

  const lagreKnapp = document.createElement('button');
  lagreKnapp.type = 'button';
  lagreKnapp.className = 'knapp knapp-primaer';
  lagreKnapp.textContent = 'Lagre endringer';

  lagreKnapp.onclick = async () => {
    const verdier = redigering.hentVerdier();
    if (!verdier.tittel || !verdier.start) {
      lagreStatus.className = 'lagre-status feil';
      lagreStatus.textContent = 'Tittel og starttidspunkt er påkrevd.';
      return;
    }
    lagreKnapp.disabled = true;
    lagreKnapp.textContent = '…';
    const data = await api.oppdaterPublisert(event.id, {
      ...verdier,
      start: datetimeLocalTilOsloISO(verdier.start),
      slutt: datetimeLocalTilOsloISO(verdier.slutt),
    });
    lagreKnapp.disabled = false;
    lagreKnapp.textContent = 'Lagre endringer';
    if (data.ok) {
      Object.assign(event, {
        tittel: verdier.tittel,
        kategori: verdier.kategori,
        sted: verdier.sted,
        pris: verdier.pris === '' ? null : Number(verdier.pris),
        prisTekst: verdier.prisTekst || null,
      });
      badge.className = `badge badge-${event.kategori}`;
      badge.textContent = event.kategori;
      tittel.textContent = `${event.fremhevet ? '★ ' : ''}${event.tittel}`;
      m.textContent = `${event.sted ?? '—'} · ${formaterDato(event.start)}${event.deaktivert ? ' · deaktivert' : ''}`;
      lagreStatus.className = 'lagre-status';
      lagreStatus.textContent = '';
      visSuksess('Endringer lagret.');
    } else {
      lagreStatus.className = 'lagre-status feil';
      lagreStatus.textContent = data.feil ?? 'Kunne ikke lagre endringene.';
      visFeil(data.feil ?? 'Kunne ikke lagre endringene.');
    }
  };
  redigerPanel.appendChild(lagreStatus);
  redigerPanel.appendChild(lagreKnapp);

  redigerKnapp.onclick = () => {
    redigerPanel.hidden = !redigerPanel.hidden;
    redigerKnapp.textContent = redigerPanel.hidden ? '✎ Rediger' : '✕ Lukk redigering';
    if (!redigerPanel.hidden) redigering.bildeCrop.lastInnVedVisning();
  };

  dKnapp.onclick = async () => {
    if (!event.deaktivert) {
      const ok = await bekreft({
        tittel: 'Deaktiver dette eventet?',
        tekst: `«${event.tittel}» forsvinner fra nettsiden til du aktiverer det igjen. Ingenting slettes.`,
        bekreftTekst: 'Deaktiver',
      });
      if (!ok) return;
    }

    dKnapp.disabled = true;
    const data = await api.deaktiver(event.id);
    dKnapp.disabled = false;
    if (data.ok) {
      event.deaktivert = data.deaktivert;
      dKnapp.classList.toggle('aktiv', data.deaktivert);
      dKnapp.textContent = data.deaktivert ? '↺ Aktiver igjen' : '🚫 Deaktiver';
      kort.classList.toggle('er-deaktivert', data.deaktivert);
      m.textContent = `${event.sted ?? '—'} · ${formaterDato(event.start)}${data.deaktivert ? ' · deaktivert' : ''}`;
      visSuksess(data.deaktivert ? `«${event.tittel}» er deaktivert.` : `«${event.tittel}» er aktivert igjen.`);
      if (!visDeaktiverte && data.deaktivert) render();
    } else {
      visFeil(data.feil ?? 'Kunne ikke endre status.');
    }
  };

  const knappRad = document.createElement('div');
  knappRad.className = 'pub-knapp-rad';
  knappRad.appendChild(redigerKnapp);
  knappRad.appendChild(dKnapp);

  kort.appendChild(knappRad);
  kort.appendChild(redigerPanel);

  return kort;
}

function oppdaterTeller() {
  const liste = synlige();
  el.teller.textContent = `${liste.length} av ${alle.length} kommende publiserte`;
}

export async function lastInnPubliserte(tving = false) {
  if (lastet && !tving) return;
  el.feed.innerHTML = '<p class="tom-melding">Laster…</p>';
  el.tom.hidden = true;
  try {
    alle = await api.hentPubliserte();
    lastet = true;
    render();
  } catch (err) {
    console.error('Kunne ikke hente publiserte events:', err);
    el.feed.innerHTML = '';
    visFeil('Kunne ikke hente publiserte events. Prøv igjen.');
  }
}

export function publiserteData() {
  return alle;
}

/* Antall fremhevede events med start i inneværende Oslo-uke (man–søn) —
   samme «ukens utvalg»-telling som toppbaren har vist siden review-
   verktøyets første versjon. */
export function fremhevetDenneUka() {
  const nå          = new Date();
  const k           = osloKomponenter(nå);
  const dagerTilMan = (k.ukedag + 6) % 7; // ukedag: 0=søn
  const iDagMidnatt = lagOsloDato(k.år, k.maned, k.dag, 0, 0, 0);
  const mandag      = new Date(iDagMidnatt.getTime() - dagerTilMan * 86400000);
  const søndagSlutt = new Date(mandag.getTime() + 7 * 86400000 - 1);

  return alle.filter((e) =>
    e.fremhevet && new Date(e.start) >= mandag && new Date(e.start) <= søndagSlutt,
  ).length;
}

el.sok?.addEventListener('input', () => {
  sokTekst = el.sok.value.trim();
  render();
});
el.kunFremhevet?.addEventListener('change', () => {
  kunFremhevet = el.kunFremhevet.checked;
  render();
});
el.visDeaktiverte?.addEventListener('change', () => {
  visDeaktiverte = el.visDeaktiverte.checked;
  render();
});
