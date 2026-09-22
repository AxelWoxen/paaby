/* publiserte.js — live events i Påby. Data hentes rett fra Postgres via
   GET /api/publiserte (collector/store/published.js) — samme spørring og
   samme felt som før. Gjentakende events vises med NESTE forekomst
   (medNesteForekomst i server.js), grunn-eventets id beholdes til
   fremhev/deaktiver/rediger/gjentas-endepunktene.

   Listen grupperes per Oslo-kalenderdag (samme idé som ukefeeden på
   hovedsiden), og hvert kort følger samme felles kortoppbygging som
   Til vurdering/Innsendte: badger + dato øverst, miniatyrbilde + tittel/
   meta, handlingsrad nederst. Gjentas vises som statusbadge her — selve
   endringen skjer inne i Rediger, ikke i listen. */

import { api } from '../api.js';
import { visSuksess, visFeil } from '../toast.js';
import { bekreft } from '../confirm.js';
import {
  formaterPris, formaterKlokkeslett, osloDagNokkel, formaterDagOverskrift,
  eventTilstand, datetimeLocalTilOsloISO, osloKomponenter, lagOsloDato,
} from '../oslo-tid.js';
import { lagGjentasKontroll, formaterGjentasStatus } from '../gjentas-ui.js';
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
  fremhevetUka: document.getElementById('publiserte-fremhevet-uka'),
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
  oppdaterFremhevetUka();

  let gjeldendeDag = null;
  let dagFeed = null;

  for (const event of liste) {
    const dagNokkel = osloDagNokkel(event.start);
    if (dagNokkel !== gjeldendeDag) {
      gjeldendeDag = dagNokkel;
      const gruppe = document.createElement('div');
      gruppe.className = 'dag-gruppe';
      const overskrift = document.createElement('h3');
      overskrift.className = 'dag-overskrift';
      overskrift.textContent = formaterDagOverskrift(event.start);
      dagFeed = document.createElement('div');
      dagFeed.className = 'feed';
      gruppe.appendChild(overskrift);
      gruppe.appendChild(dagFeed);
      el.feed.appendChild(gruppe);
    }
    dagFeed.appendChild(lagPubKort(event));
  }
}

function lagMiniatyrbilde(event) {
  const wrap = document.createElement('div');
  wrap.className = 'kort-bilde-wrapper';
  if (event.bilde) {
    const img = document.createElement('img');
    img.className = 'kort-bilde';
    img.src = event.bilde;
    img.alt = '';
    img.loading = 'lazy';
    img.addEventListener('error', () => {
      img.remove();
      wrap.appendChild(lagPlaceholder());
    }, { once: true });
    wrap.appendChild(img);
  } else {
    wrap.appendChild(lagPlaceholder());
  }
  return wrap;

  function lagPlaceholder() {
    const p = document.createElement('div');
    p.className = 'kort-bilde-placeholder';
    return p;
  }
}

function lagPubKort(event) {
  const kort = document.createElement('article');
  kort.className = `admin-kort pub-kort${event.fremhevet ? ' er-fremhevet' : ''}${event.deaktivert ? ' er-deaktivert' : ''}`;
  kort.dataset.id = event.id;
  kort.dataset.kategori = event.kategori;

  // ─── Topprad: badger til venstre, klokkeslett til høyre ────────────────
  const topprad = document.createElement('div');
  topprad.className = 'kort-topprad';

  const badger = document.createElement('div');
  badger.className = 'kort-badger';

  const badge = document.createElement('span');
  badge.className = 'badge badge-kategori';
  badge.dataset.kategori = event.kategori;
  badge.textContent = event.kategori === 'pafunn' ? 'påfunn' : event.kategori;
  badger.appendChild(badge);

  if (event.deaktivert) {
    const d = document.createElement('span');
    d.className = 'badge badge-status';
    d.textContent = 'Deaktivert';
    badger.appendChild(d);
  }

  const gjentasTekst = formaterGjentasStatus(event.gjentas);
  let gjentasBadgeEl = null;
  if (gjentasTekst) {
    gjentasBadgeEl = document.createElement('span');
    gjentasBadgeEl.className = 'gjentas-badge';
    gjentasBadgeEl.textContent = gjentasTekst;
    badger.appendChild(gjentasBadgeEl);
  }
  topprad.appendChild(badger);

  const klokkeslett = document.createElement('span');
  klokkeslett.className = 'kort-dato';
  klokkeslett.textContent = formaterKlokkeslett(event.start);
  topprad.appendChild(klokkeslett);

  kort.appendChild(topprad);

  // ─── Hode: miniatyrbilde + tittel/meta ─────────────────────────────────
  const hode = document.createElement('div');
  hode.className = 'kort-hode';
  hode.appendChild(lagMiniatyrbilde(event));

  const brodtekst = document.createElement('div');
  brodtekst.className = 'kort-brodtekst';

  const tittel = document.createElement('h3');
  tittel.className = 'kort-tittel';
  tittel.textContent = event.tittel;
  brodtekst.appendChild(tittel);

  const meta = document.createElement('div');
  meta.className = 'kort-info';
  const stedInfo = document.createElement('span');
  stedInfo.textContent = event.sted ?? '—';
  meta.appendChild(stedInfo);
  const prisInfo = document.createElement('span');
  prisInfo.textContent = formaterPris(event.pris, event.prisTekst);
  meta.appendChild(prisInfo);
  if (event.lenke) {
    try {
      const url = new URL(event.lenke);
      if (url.protocol === 'https:' || url.protocol === 'http:') {
        const lenkeEl = document.createElement('a');
        lenkeEl.className = 'ekstern-lenke';
        lenkeEl.href = url.href;
        lenkeEl.target = '_blank';
        lenkeEl.rel = 'noopener noreferrer';
        lenkeEl.textContent = 'billett / info';
        meta.appendChild(lenkeEl);
      }
    } catch { /* ugyldig lenke — vis ikke */ }
  }
  brodtekst.appendChild(meta);

  hode.appendChild(brodtekst);
  kort.appendChild(hode);

  // ─── Handlingsrad: sekundær (Rediger) / destruktiv (Deaktiver), stjerne
  // på fast plass til høyre — fremhevet vises ÉN gang (denne knappen +
  // kraftigere kortramme), ikke også som prefiks i tittelen. ─────────────
  const handlingRad = document.createElement('div');
  handlingRad.className = 'knapp-rad';

  const redigerKnapp = document.createElement('button');
  redigerKnapp.type = 'button';
  redigerKnapp.className = 'knapp knapp-sekundaer knapp-detaljer';
  redigerKnapp.textContent = 'Rediger';

  const dKnapp = document.createElement('button');
  dKnapp.type = 'button';
  dKnapp.className = 'knapp knapp-destruktiv';
  dKnapp.textContent = event.deaktivert ? 'Aktiver igjen' : 'Deaktiver';

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
      visSuksess(data.fremhevet ? `«${event.tittel}» er fremhevet.` : `Fremheving fjernet fra «${event.tittel}».`);
      oppdaterFremhevetUka();
      if (kunFremhevet && !data.fremhevet) render();
    } else {
      visFeil(data.feil ?? 'Kunne ikke endre fremheving.');
    }
  };

  handlingRad.appendChild(redigerKnapp);
  handlingRad.appendChild(dKnapp);
  handlingRad.appendChild(fKnapp);
  kort.appendChild(handlingRad);

  // ─── Redigeringspanel (skjult til «Rediger» trykkes) ───────────────────
  const redigerPanel = document.createElement('div');
  redigerPanel.className = 'pub-rediger-panel';
  redigerPanel.hidden = true;

  const redigering = lagRedigeringsFelter(event);
  redigerPanel.appendChild(redigering.el);

  const gjKontroll = lagGjentasKontroll(event.gjentas ?? null);
  const gjStatus = document.createElement('span');
  gjStatus.className = 'gjentas-status';
  gjKontroll.el.appendChild(gjStatus);
  redigerPanel.appendChild(gjKontroll.el);

  gjKontroll.el.querySelectorAll('select').forEach((select) => {
    select.addEventListener('change', async () => {
      gjStatus.textContent = '…';
      const data = await api.oppdaterGjentas(event.id, gjKontroll.hentVerdi());
      if (data.ok) {
        event.gjentas = data.gjentas;
        gjStatus.textContent = 'Lagret';
        visSuksess('Gjentakelse oppdatert.');
        const nyTekst = formaterGjentasStatus(event.gjentas);
        if (nyTekst) {
          if (!gjentasBadgeEl) {
            gjentasBadgeEl = document.createElement('span');
            gjentasBadgeEl.className = 'gjentas-badge';
            badger.appendChild(gjentasBadgeEl);
          }
          gjentasBadgeEl.textContent = nyTekst;
        } else if (gjentasBadgeEl) {
          gjentasBadgeEl.remove();
          gjentasBadgeEl = null;
        }
      } else {
        gjStatus.textContent = 'Feilet';
        visFeil(data.feil ?? 'Kunne ikke oppdatere gjentakelse.');
      }
      setTimeout(() => { gjStatus.textContent = ''; }, 1800);
    });
  });

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
      badge.dataset.kategori = event.kategori;
      badge.textContent = event.kategori === 'pafunn' ? 'påfunn' : event.kategori;
      kort.dataset.kategori = event.kategori;
      tittel.textContent = event.tittel;
      stedInfo.textContent = event.sted ?? '—';
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
  kort.appendChild(redigerPanel);

  redigerKnapp.onclick = () => {
    redigerPanel.hidden = !redigerPanel.hidden;
    redigerKnapp.textContent = redigerPanel.hidden ? 'Rediger' : 'Skjul redigering';
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
      dKnapp.textContent = data.deaktivert ? 'Aktiver igjen' : 'Deaktiver';
      kort.classList.toggle('er-deaktivert', data.deaktivert);
      visSuksess(data.deaktivert ? `«${event.tittel}» er deaktivert.` : `«${event.tittel}» er aktivert igjen.`);
      if (!visDeaktiverte && data.deaktivert) render();
    } else {
      visFeil(data.feil ?? 'Kunne ikke endre status.');
    }
  };

  return kort;
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

function oppdaterFremhevetUka() {
  if (!el.fremhevetUka) return;
  const antall = fremhevetDenneUka();
  el.fremhevetUka.textContent = antall > 0 ? `${antall} fremhevet denne uka` : '';
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
