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

// Samme verdier og tekster som AVSLAGSGRUNNER i collector/core/interesse.js
// (serveren avviser alt annet). «Passert» settes kun av bulk-knappene.
export const AVSLAGSGRUNNER = [
  { verdi: 'ikke-relevant',   tekst: 'Ikke Påby' },
  { verdi: 'for-kommersielt', tekst: 'For stort / kommersielt' },
  { verdi: 'utenfor-oslo',    tekst: 'Utenfor Oslo' },
  { verdi: 'duplikat',        tekst: 'Duplikat' },
  { verdi: 'mangler-info',    tekst: 'Mangler info' },
];

// «sted:bla» → «sted: bla ↑» — agentens grunner, lesbart i en tooltip.
function formaterGrunner(grunner) {
  return (grunner ?? [])
    .map((g) => `${g.egenskap.replace(':', ': ')} ${g.vekt > 0 ? '↑' : '↓'}`)
    .join(' · ');
}

function lagAgentTekst(event) {
  if (event._inkludertManuelt) return 'Lagt i utvalget av deg';
  const score = typeof event._interesse === 'number' ? Math.round(event._interesse) : null;
  if (event._agentValg === 'usikker') return `Agenten er usikker — relevans ${score}`;
  if (event._agentValg === 'ikke-valgt') {
    return event._holdtUte
      ? `Ikke valgt av agenten — ${event._holdtUte}`
      : `Ikke valgt av agenten — lav relevans (${score})`;
  }
  return null;
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
 * @param {{ visInnsender?: boolean, modus?: 'vurdering' | 'fra-api', onInkludert?: () => void }} valg
 *   modus 'vurdering' (standard): "Godkjenn" publiserer (Til vurdering/Innsendte).
 *   modus 'fra-api': "Godkjenn" sender til vurdering i stedet — ingen
 *   publisering ennå, og fremhev-stjernen skjules (avgjøres ved faktisk
 *   publisering, ikke her). Funn agenten har lagt til side (usikre/ikke
 *   valgt) får i tillegg «Legg i utvalget»; onInkludert kalles etterpå.
 * @returns {{ el: HTMLElement, lastInnBilde: () => void }}
 */
export function lagKandidatKort(event, { visInnsender = false, modus = 'vurdering', onInkludert = null } = {}) {
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
  // Agentens interesse-score (kun collector-funn). Ingen badge når den
  // ikke har nok beslutninger å lære av ennå (score null).
  if (event._kilde === 'collector' && typeof event._interesse === 'number') {
    const s = document.createElement('span');
    s.className = `badge badge-status${event._agentValg === 'valgt' ? ' badge-fylt' : ''}`;
    s.textContent = `Relevans ${Math.round(event._interesse)}`;
    const grunner = formaterGrunner(event._interesseGrunner);
    if (grunner) s.title = grunner;
    badger.appendChild(s);
  }
  if (event._muligDuplikat) {
    const d = document.createElement('span');
    d.className = 'badge badge-status';
    d.textContent = 'Mulig duplikat';
    if (event._duplikatHint) d.title = event._duplikatHint;
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

  const kartEl = document.createElement('a');
  kartEl.className = 'ekstern-lenke';
  kartEl.target = '_blank';
  kartEl.rel = 'noopener noreferrer';
  kartEl.textContent = 'kart';
  infoRad.appendChild(kartEl);
  function oppdaterKartLenke(adresse) {
    if (adresse) {
      kartEl.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresse)}`;
      kartEl.hidden = false;
    } else {
      kartEl.hidden = true;
    }
  }
  oppdaterKartLenke(event.adresse);

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

  // Hvorfor agenten la eventet til side (eller at du har lagt det tilbake).
  const agentTekst = lagAgentTekst(event);
  if (agentTekst) {
    const a = document.createElement('p');
    a.className = 'kort-holdt-ute';
    a.textContent = agentTekst;
    brodtekst.appendChild(a);
  }

  if (event._mangler?.length) {
    const m = document.createElement('p');
    m.className = 'kort-mangler';
    m.textContent = `Mangler: ${event._mangler.join(', ')}`;
    brodtekst.appendChild(m);
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
  // scanne listen raskt. Bygges først når det trengs (byggPanel): med 100+
  // kort i lista ble skjulte skjemaer ellers mesteparten av siden. ─────────
  const panel = document.createElement('div');
  panel.className = 'kandidat-panel';
  panel.hidden = true;
  kort.appendChild(panel);

  let redigering = null;
  let gjentasKontroll = null;

  // Henter NÅVÆRENDE skjemaverdier (konvertert til Oslo-ISO), uansett om
  // «Lagre endringer» noensinne er trykket. Brukes av Lagre endringer,
  // Godkjenn og Send til vurdering — slik publiserer/lagrer alle tre
  // nøyaktig det som faktisk står i skjemaet akkurat nå. Bygger panelet
  // ved behov, så Godkjenn virker også uten at detaljene er åpnet.
  function hentOgValiderRedigering() {
    byggPanel();
    const verdier = redigering.hentVerdier();
    if (!verdier.tittel || !verdier.start) {
      return { feil: 'Tittel og starttidspunkt er påkrevd.' };
    }
    return {
      redigering: {
        ...verdier,
        start: datetimeLocalTilOsloISO(verdier.start),
        slutt: datetimeLocalTilOsloISO(verdier.slutt),
      },
    };
  }

  function byggPanel() {
    if (redigering) return;

    if (visInnsender) panel.appendChild(lagInnsenderBoks(event));
    if (event._muligDuplikat && event._duplikatHint) {
      const varsel = document.createElement('div');
      varsel.className = 'duplikat-varsel';
      varsel.textContent = event._duplikatHint;
      panel.appendChild(varsel);
    }

    redigering = lagRedigeringsFelter(event);
    panel.appendChild(redigering.el);

    const lagreStatus = document.createElement('div');
    lagreStatus.className = 'lagre-status';

    const lagreKnapp = document.createElement('button');
    lagreKnapp.type = 'button';
    lagreKnapp.className = 'knapp knapp-sekundaer';
    lagreKnapp.textContent = 'Lagre endringer';

    lagreKnapp.onclick = async () => {
      const { redigering: redigeringData, feil } = hentOgValiderRedigering();
      if (feil) {
        lagreStatus.className = 'lagre-status feil';
        lagreStatus.textContent = feil;
        return;
      }
      lagreKnapp.disabled = true;
      lagreKnapp.textContent = '…';
      const data = await api.oppdaterKandidat(event.id, redigeringData);
      lagreKnapp.disabled = false;
      lagreKnapp.textContent = 'Lagre endringer';
      if (data.ok) {
        event.tittel = redigeringData.tittel;
        event.kategori = redigeringData.kategori;
        event.sted = redigeringData.sted;
        event.adresse = redigeringData.adresse;
        event.tags = data.tags;
        tittelEl.textContent = redigeringData.tittel;
        badge.dataset.kategori = redigeringData.kategori;
        badge.textContent = redigeringData.kategori === 'pafunn' ? 'påfunn' : redigeringData.kategori;
        kort.dataset.kategori = redigeringData.kategori;
        stedInfo.textContent = redigeringData.sted || '—';
        oppdaterKartLenke(redigeringData.adresse);
        redigering.felter.tagVelger.settVerdier(data.tags);
        visSuksess('Endringer lagret.');
      } else {
        lagreStatus.className = 'lagre-status feil';
        lagreStatus.textContent = data.feil ?? 'Kunne ikke lagre endringene.';
        visFeil(data.feil ?? 'Kunne ikke lagre endringene.');
      }
    };
    panel.appendChild(lagreStatus);
    panel.appendChild(lagreKnapp);

    gjentasKontroll = lagGjentasKontroll(event.gjentas ?? null);

    const beslutningRad = document.createElement('div');
    beslutningRad.className = 'beslutning-rad';
    beslutningRad.appendChild(gjentasKontroll.el);
    panel.appendChild(beslutningRad);
  }

  function lastInnBilde() {
    byggPanel();
    redigering.bildeCrop.lastInnVedVisning();
  }

  const detaljerKnapp = document.createElement('button');
  detaljerKnapp.type = 'button';
  detaljerKnapp.className = 'knapp knapp-sekundaer knapp-detaljer';
  detaljerKnapp.textContent = 'Vis detaljer';
  detaljerKnapp.onclick = () => {
    panel.hidden = !panel.hidden;
    detaljerKnapp.textContent = panel.hidden ? 'Vis detaljer' : 'Skjul detaljer';
    if (!panel.hidden) lastInnBilde();
  };

  // ─── Handlingsrad (alltid synlig): primær / sekundær / destruktiv, med
  // stjernen på fast plass helt til høyre. ────────────────────────────────
  const handlingRad = document.createElement('div');
  handlingRad.className = 'knapp-rad';

  const gKnapp = document.createElement('button');
  gKnapp.className = 'knapp knapp-primaer knapp-godkjenn';
  gKnapp.textContent = modus === 'fra-api' ? 'Send til vurdering' : 'Godkjenn';

  const aKnapp = document.createElement('button');
  aKnapp.className = 'knapp knapp-destruktiv knapp-avslaa';
  aKnapp.textContent = 'Avslå';

  const fKnapp = document.createElement('button');
  fKnapp.className = 'knapp-fremhev';
  fKnapp.title = 'Fremhev ved publisering';
  fKnapp.textContent = '★';
  fKnapp.setAttribute('aria-pressed', 'false');
  // Fremhev avgjøres først når eventet faktisk publiseres (Til vurdering),
  // ikke når en rå collector-candidate bare sendes videre dit.
  if (modus === 'fra-api') fKnapp.hidden = true;

  fKnapp.onclick = () => {
    event._fremhevet = !event._fremhevet;
    fKnapp.classList.toggle('aktiv', event._fremhevet);
    fKnapp.setAttribute('aria-pressed', String(event._fremhevet));
    fKnapp.title = event._fremhevet ? 'Fjern fremheving' : 'Fremhev ved publisering';
    oppdaterFremhevetBadge();
  };

  // «Legg i utvalget»: kun for collector-funn agenten har lagt til side.
  const kanInkluderes = modus === 'fra-api' && event._agentValg && event._agentValg !== 'valgt';
  const iKnapp = document.createElement('button');
  iKnapp.type = 'button';
  iKnapp.className = 'knapp knapp-sekundaer knapp-inkluder';
  iKnapp.textContent = 'Legg i utvalget';

  function settKnapperDisabled(v) {
    gKnapp.disabled = aKnapp.disabled = fKnapp.disabled = detaljerKnapp.disabled = iKnapp.disabled = v;
  }

  iKnapp.onclick = async () => {
    settKnapperDisabled(true);
    iKnapp.textContent = '…';
    const data = await api.inkluder(event.id);
    if (data.ok) {
      event._inkludertManuelt = true;
      event._holdtUte = null;
      event._agentValg = 'valgt';
      visSuksess(`«${event.tittel}» er lagt i agentens utvalg.`);
      kort.style.transition = 'opacity .2s';
      kort.style.opacity = '0';
      setTimeout(() => onInkludert?.(), 200);
    } else {
      settKnapperDisabled(false);
      iKnapp.textContent = 'Legg i utvalget';
      visFeil(data.feil ?? 'Kunne ikke legge eventet i utvalget.');
    }
  };

  gKnapp.onclick = async () => {
    // Samme skjemaverdier som «Lagre endringer» ville sendt — Godkjenn/Send
    // til vurdering skal publisere/lagre nøyaktig det som står i skjemaet nå,
    // uten at man først må trykke «Lagre endringer» (se hentOgValiderRedigering).
    const { redigering: redigeringData, feil } = hentOgValiderRedigering();
    if (feil) {
      visFeil(feil);
      return;
    }

    settKnapperDisabled(true);
    gKnapp.textContent = '…';

    const data = modus === 'fra-api'
      ? await api.triager(event.id, {
          redigering: redigeringData,
          gjentas: gjentasKontroll.hentVerdi(),
        })
      : await api.godkjenn(event.id, {
          redigering: redigeringData,
          fremhevet: event._fremhevet === true,
          gjentas: gjentasKontroll.hentVerdi(),
        });

    if (data.ok) {
      kort.style.transition = 'opacity .2s';
      kort.style.opacity = '0';
      if (modus === 'fra-api') {
        event._status = 'triaged';
        visSuksess(`«${event.tittel}» er sendt til vurdering.`);
      } else {
        event._status = 'godkjent';
        visSuksess(`«${event.tittel}» er publisert${event._fremhevet ? ' og fremhevet' : ''}.`);
      }
      setTimeout(() => {
        kort.remove();
        // Trengs kun ved triage: Til vurdering-fanen må vite at et nytt
        // event nå er tilgjengelig der. Vanlig godkjenn (publisering) fjerner
        // fortsatt bare kortet lokalt, uten full refetch/flimmer i lista.
        if (modus === 'fra-api') {
          document.dispatchEvent(new CustomEvent('paaby:candidates-endret'));
        }
      }, 200);
    } else {
      settKnapperDisabled(false);
      gKnapp.textContent = modus === 'fra-api' ? 'Send til vurdering' : 'Godkjenn';
      visFeil(data.feil ?? (modus === 'fra-api' ? 'Kunne ikke sende til vurdering.' : 'Kunne ikke godkjenne eventet.'));
    }
  };

  aKnapp.onclick = async () => {
    // Grunnen lærer agenten om avslaget handlet om smak (Ikke Påby, For
    // kommersielt, …) eller ikke (Duplikat, Mangler info). Valgfri.
    const grunn = await bekreft({
      tittel: 'Avslå dette eventet?',
      tekst: `«${event.tittel}» fjernes fra listen og foreslås ikke på nytt. Hvorfor? (valgfritt — hjelper agenten å lære)`,
      bekreftTekst: 'Avslå',
      grunner: AVSLAGSGRUNNER,
    });
    if (grunn === false) return;

    settKnapperDisabled(true);
    aKnapp.textContent = '…';
    const data = await api.avslaa(event.id, grunn);
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
  // Legges kun til når den gjelder — .knapp sin display overstyrer [hidden].
  if (kanInkluderes) handlingRad.appendChild(iKnapp);
  handlingRad.appendChild(detaljerKnapp);
  handlingRad.appendChild(aKnapp);
  handlingRad.appendChild(fKnapp);

  kort.appendChild(handlingRad);

  return { el: kort, lastInnBilde };
}
