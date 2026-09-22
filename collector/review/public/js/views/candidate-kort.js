/* candidate-kort.js — delt kortkomponent for "Til vurdering" og "Innsendte".
   Begge faner viser rader fra samme event_candidates-tabell (kun filtrert på
   source), og bruker de samme to endepunktene (godkjenn / avslå / kandidat-
   oppdater) — se collector/review/server.js. Kortet er derfor bygget én
   gang og gjenbrukt, med et lite valg for om innsenderboksen skal vises.

   Felles kortoppbygging (samme rekkefølge i alle faner, se admin.css):
   badger + dato øverst, miniatyrbilde + tittel/meta, handlingsrad nederst
   (primær/sekundær/destruktiv, stjerne på fast plass). Kuratortekst,
   gjentas og full redigering ligger bak "Vis detaljer" — kompakt liste
   inntil man faktisk åpner et kort. */

import { api } from '../api.js';
import { visSuksess, visFeil } from '../toast.js';
import { bekreft } from '../confirm.js';
import { formaterDato, formaterPris, erPassert, datetimeLocalTilOsloISO } from '../oslo-tid.js';
import { lagGjentasKontroll } from '../gjentas-ui.js';
import { lagRedigeringsFelter } from '../ui-helpers.js';

function lagKontaktLenke(kontakt) {
  if (!kontakt) return null;
  const verdi = kontakt.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(verdi)) {
    const a = document.createElement('a');
    a.href = `mailto:${verdi}`;
    a.textContent = verdi;
    return a;
  }
  const handle = verdi.replace(/^@/, '');
  const a = document.createElement('a');
  a.href = `https://instagram.com/${encodeURIComponent(handle)}`;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = verdi.startsWith('@') ? verdi : `@${handle}`;
  return a;
}

function lagInnsenderBoks(event) {
  const boks = document.createElement('div');
  boks.className = 'innsender-boks';

  const navnRad = document.createElement('div');
  navnRad.className = 'innsender-rad';
  const navnLabel = document.createElement('strong');
  navnLabel.textContent = 'Innsendt av: ';
  navnRad.appendChild(navnLabel);
  navnRad.appendChild(document.createTextNode(event._innsenderNavn ?? '—'));
  if (event._innsenderOrg) navnRad.appendChild(document.createTextNode(` (${event._innsenderOrg})`));
  boks.appendChild(navnRad);

  const kontaktRad = document.createElement('div');
  kontaktRad.className = 'innsender-rad';
  const kontaktLabel = document.createElement('strong');
  kontaktLabel.textContent = 'Kontakt: ';
  kontaktRad.appendChild(kontaktLabel);
  const lenke = lagKontaktLenke(event._innsenderKontakt);
  kontaktRad.appendChild(lenke ?? document.createTextNode(event._innsenderKontakt ?? '—'));
  boks.appendChild(kontaktRad);

  if (event._innsenderNotat) {
    const notatRad = document.createElement('div');
    notatRad.className = 'innsender-rad';
    const notatLabel = document.createElement('strong');
    notatLabel.textContent = 'Kommentar:';
    notatRad.appendChild(notatLabel);
    notatRad.appendChild(document.createElement('br'));
    const notatTekst = document.createElement('span');
    notatTekst.className = 'innsender-notat';
    notatTekst.textContent = event._innsenderNotat;
    notatRad.appendChild(notatTekst);
    boks.appendChild(notatRad);
  }

  return boks;
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

/**
 * @param {Object} event  candidate fra /api/candidates
 * @param {{ visInnsender: boolean, fjernFraListe: () => void }} valg
 * @returns {{ el: HTMLElement, lastInnBilde: () => void }}
 */
export function lagKandidatKort(event, { visInnsender = false } = {}) {
  const kort = document.createElement('article');
  kort.className = 'admin-kort kandidat-kort';
  kort.dataset.id = event.id;
  kort.dataset.kategori = event.kategori;

  // ─── Topprad: badger til venstre, dato til høyre ──────────────────────
  const topprad = document.createElement('div');
  topprad.className = 'kort-topprad';

  const badger = document.createElement('div');
  badger.className = 'kort-badger';

  const badge = document.createElement('span');
  badge.className = 'badge badge-kategori';
  badge.dataset.kategori = event.kategori;
  badge.textContent = event.kategori === 'pafunn' ? 'påfunn' : event.kategori;
  badger.appendChild(badge);

  let fremhevetBadge = null;
  function oppdaterFremhevetBadge() {
    if (event._fremhevet && !fremhevetBadge) {
      fremhevetBadge = document.createElement('span');
      fremhevetBadge.className = 'badge badge-status badge-fylt';
      fremhevetBadge.textContent = 'Fremhevet';
      badger.insertBefore(fremhevetBadge, badger.children[1] ?? null);
    } else if (!event._fremhevet && fremhevetBadge) {
      fremhevetBadge.remove();
      fremhevetBadge = null;
    }
  }

  if (event._kilde === 'manuell') {
    const m = document.createElement('span');
    m.className = 'badge badge-status';
    m.textContent = 'Manuelt lagt inn';
    badger.appendChild(m);
  }
  if (visInnsender && event._muligDuplikat) {
    const d = document.createElement('span');
    d.className = 'badge badge-status';
    d.textContent = 'Mulig duplikat';
    badger.appendChild(d);
  }
  if (erPassert(event)) {
    const p = document.createElement('span');
    p.className = 'badge badge-status';
    p.textContent = 'Passert';
    badger.appendChild(p);
  }
  topprad.appendChild(badger);

  const dato = document.createElement('span');
  dato.className = 'kort-dato';
  dato.textContent = formaterDato(event.start);
  topprad.appendChild(dato);

  kort.appendChild(topprad);

  // ─── Hode: miniatyrbilde + tittel/meta ─────────────────────────────────
  const hode = document.createElement('div');
  hode.className = 'kort-hode';
  hode.appendChild(lagMiniatyrbilde(event));

  const brodtekst = document.createElement('div');
  brodtekst.className = 'kort-brodtekst';

  const tittelEl = document.createElement('h3');
  tittelEl.className = 'kort-tittel';
  tittelEl.textContent = event.tittel;
  brodtekst.appendChild(tittelEl);

  const infoRad = document.createElement('div');
  infoRad.className = 'kort-info';
  const stedInfo = document.createElement('span');
  stedInfo.textContent = event.sted ?? '—';
  infoRad.appendChild(stedInfo);
  const prisInfo = document.createElement('span');
  prisInfo.textContent = formaterPris(event.pris, event.prisTekst);
  infoRad.appendChild(prisInfo);
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
        infoRad.appendChild(lenkeEl);
      }
    } catch { /* ugyldig lenke — vis ikke */ }
  }
  brodtekst.appendChild(infoRad);

  if (visInnsender) {
    const kortNavn = document.createElement('p');
    kortNavn.className = 'kort-innsender-kort';
    kortNavn.textContent = `Sendt inn av ${event._innsenderNavn ?? 'ukjent'}${event._innsenderOrg ? ` (${event._innsenderOrg})` : ''}`;
    brodtekst.appendChild(kortNavn);
  }

  if (event.beskrivelse) {
    const besk = document.createElement('p');
    besk.className = 'kort-beskrivelse-kort';
    besk.textContent = event.beskrivelse;
    brodtekst.appendChild(besk);
  }

  hode.appendChild(brodtekst);
  kort.appendChild(hode);

  // ─── Detaljpanel (skjult til «Vis detaljer» trykkes): innsenderboks,
  // full redigering, kuratortekst og gjentas — alt som ikke trengs for å
  // scanne listen raskt. ──────────────────────────────────────────────────
  const panel = document.createElement('div');
  panel.className = 'kandidat-panel';
  panel.hidden = true;

  if (visInnsender) {
    panel.appendChild(lagInnsenderBoks(event));
    if (event._muligDuplikat && event._duplikatHint) {
      const varsel = document.createElement('div');
      varsel.className = 'duplikat-varsel';
      varsel.textContent = event._duplikatHint;
      panel.appendChild(varsel);
    }
  }

  const redigering = lagRedigeringsFelter(event);
  panel.appendChild(redigering.el);

  const lagreStatus = document.createElement('div');
  lagreStatus.className = 'lagre-status';

  const lagreKnapp = document.createElement('button');
  lagreKnapp.type = 'button';
  lagreKnapp.className = 'knapp knapp-sekundaer';
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
    const data = await api.oppdaterKandidat(event.id, {
      ...verdier,
      start: datetimeLocalTilOsloISO(verdier.start),
      slutt: datetimeLocalTilOsloISO(verdier.slutt),
    });
    lagreKnapp.disabled = false;
    lagreKnapp.textContent = 'Lagre endringer';
    if (data.ok) {
      event.tittel = verdier.tittel;
      event.kategori = verdier.kategori;
      event.sted = verdier.sted;
      tittelEl.textContent = verdier.tittel;
      badge.dataset.kategori = verdier.kategori;
      badge.textContent = verdier.kategori === 'pafunn' ? 'påfunn' : verdier.kategori;
      kort.dataset.kategori = verdier.kategori;
      stedInfo.textContent = verdier.sted || '—';
      visSuksess('Endringer lagret.');
    } else {
      lagreStatus.className = 'lagre-status feil';
      lagreStatus.textContent = data.feil ?? 'Kunne ikke lagre endringene.';
      visFeil(data.feil ?? 'Kunne ikke lagre endringene.');
    }
  };
  panel.appendChild(lagreStatus);
  panel.appendChild(lagreKnapp);

  // Kuratortekst-feltet finnes allerede inne i redigering.el (lagRedigeringsFelter
  // sin egen tKur) — IKKE dupliser det. Godkjenn leser samme felt, ikke et
  // eget skjult felt utenfor redigeringspanelet.
  const kuratorTa = redigering.felter.tKur.ta;

  const gjentasKontroll = lagGjentasKontroll(event.gjentas ?? null);

  const beslutningRad = document.createElement('div');
  beslutningRad.className = 'beslutning-rad';
  beslutningRad.appendChild(gjentasKontroll.el);
  panel.appendChild(beslutningRad);

  kort.appendChild(panel);

  const detaljerKnapp = document.createElement('button');
  detaljerKnapp.type = 'button';
  detaljerKnapp.className = 'knapp knapp-sekundaer knapp-detaljer';
  detaljerKnapp.textContent = 'Vis detaljer';
  detaljerKnapp.onclick = () => {
    panel.hidden = !panel.hidden;
    detaljerKnapp.textContent = panel.hidden ? 'Vis detaljer' : 'Skjul detaljer';
    if (!panel.hidden) redigering.bildeCrop.lastInnVedVisning();
  };

  // ─── Handlingsrad (alltid synlig): primær / sekundær / destruktiv, med
  // stjernen på fast plass helt til høyre. ────────────────────────────────
  const handlingRad = document.createElement('div');
  handlingRad.className = 'knapp-rad';

  const gKnapp = document.createElement('button');
  gKnapp.className = 'knapp knapp-primaer knapp-godkjenn';
  gKnapp.textContent = 'Godkjenn';

  const aKnapp = document.createElement('button');
  aKnapp.className = 'knapp knapp-destruktiv knapp-avslaa';
  aKnapp.textContent = 'Avslå';

  const fKnapp = document.createElement('button');
  fKnapp.className = 'knapp-fremhev';
  fKnapp.title = 'Fremhev ved publisering';
  fKnapp.textContent = '★';
  fKnapp.setAttribute('aria-pressed', 'false');

  fKnapp.onclick = () => {
    event._fremhevet = !event._fremhevet;
    fKnapp.classList.toggle('aktiv', event._fremhevet);
    fKnapp.setAttribute('aria-pressed', String(event._fremhevet));
    fKnapp.title = event._fremhevet ? 'Fjern fremheving' : 'Fremhev ved publisering';
    oppdaterFremhevetBadge();
  };

  function settKnapperDisabled(v) {
    gKnapp.disabled = aKnapp.disabled = fKnapp.disabled = detaljerKnapp.disabled = v;
  }

  gKnapp.onclick = async () => {
    settKnapperDisabled(true);
    gKnapp.textContent = '…';
    const data = await api.godkjenn(event.id, {
      kuratortekst: kuratorTa.value,
      fremhevet: event._fremhevet === true,
      gjentas: gjentasKontroll.hentVerdi(),
    });
    if (data.ok) {
      kort.style.transition = 'opacity .2s';
      kort.style.opacity = '0';
      event._status = 'godkjent';
      visSuksess(`«${event.tittel}» er publisert${event._fremhevet ? ' og fremhevet' : ''}.`);
      setTimeout(() => kort.remove(), 200);
    } else {
      settKnapperDisabled(false);
      gKnapp.textContent = 'Godkjenn';
      visFeil(data.feil ?? 'Kunne ikke godkjenne eventet.');
    }
  };

  aKnapp.onclick = async () => {
    const ok = await bekreft({
      tittel: 'Avslå dette eventet?',
      tekst: `«${event.tittel}» fjernes fra listen og foreslås ikke på nytt.`,
      bekreftTekst: 'Avslå',
    });
    if (!ok) return;

    settKnapperDisabled(true);
    aKnapp.textContent = '…';
    const data = await api.avslaa(event.id);
    if (data.ok) {
      kort.style.transition = 'opacity .2s';
      kort.style.opacity = '0';
      event._status = 'avslatt';
      visSuksess(`«${event.tittel}» ble avslått.`);
      setTimeout(() => kort.remove(), 200);
    } else {
      settKnapperDisabled(false);
      aKnapp.textContent = 'Avslå';
      visFeil(data.feil ?? 'Kunne ikke avslå eventet.');
    }
  };

  handlingRad.appendChild(gKnapp);
  handlingRad.appendChild(detaljerKnapp);
  handlingRad.appendChild(aKnapp);
  handlingRad.appendChild(fKnapp);

  kort.appendChild(handlingRad);

  return { el: kort, lastInnBilde: redigering.bildeCrop.lastInnVedVisning };
}
