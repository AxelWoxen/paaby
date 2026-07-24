/* modal.js — presentasjonslaget for detaljvisning.
   Bygger DOM-elementer direkte (ingen innerHTML med brukerdata) for å unngå XSS.
   Håndterer fokus-felle, hash-ruting og synkronisering av lagret-tilstand. */

/* ─── IKON ─────────────────────────────────────────────────────────────────── */
const BINDERS_SVG_SM = '<svg class="binders-ikon" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" stroke="currentColor" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"/></svg>';

import { erLagret, veksleLagret }                     from '../application/lagret.js';
import { erFulgt, veksleFulgt }                       from '../application/fulgte-steder.js';
import { formaterPrisTekst, formaterTidKort,
         formaterAvstand, formaterVerifisert,
         kategoriVisningsnavn }                        from '../application/formatering.js';
import { erGyldigUrl }                                 from '../application/validering.js';
import { hentEventbilde, KATEGORI_BILDER }             from '../application/kategori-bilder.js';
import { trackEvent }                                  from '../application/sporing.js';
import { synkroniserKortHjerte }                       from './feed.js';

/* Konfigurasjon — fyll inn produksjonsdomene og evt. feedback-URL. */
const KONFIG = {
  /* Produksjonsdomene — legg til før lansering. Brukes til deling.
     Eksempel: 'https://paaby.no'  */
  prodDomene: '',

  /* Feedback-lenke (e-post, Instagram osv.). La stå tom for å skjule.
     Eksempel: 'mailto:hei@paaby.no' eller 'https://instagram.com/paaby' */
  feedbackUrl: '',
};

let åpenEvent              = null;
let forrigeAktivtElement   = null; /* fokus returneres hit når modal lukkes */


/* ========================
   ÅPNE / LUKKE
   ======================== */

export function åpneModal(event) {
  trackEvent('kort_åpnet', { kategori: event.kategori });
  åpenEvent            = event;
  forrigeAktivtElement = document.activeElement;

  const modal   = document.getElementById('modal');
  const innhold = document.getElementById('modal-innhold');

  /* Tøm og bygg innhold på nytt */
  innhold.innerHTML = '';
  innhold.appendChild(byggModalInnhold(event));

  modal.classList.add('aktiv');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-aapen');

  /* Flytt fokus til lukkeknappen */
  document.getElementById('modal-lukk').focus();

  /* Oppdater hash uten å legge til historikkoppføring */
  history.replaceState(null, '', `#event/${encodeURIComponent(event.id)}`);

  leggTilModalLyttere(event);
}

export function lukkModal() {
  const modal = document.getElementById('modal');
  modal.classList.remove('aktiv');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-aapen');
  åpenEvent = null;

  /* Fjern event-hash */
  history.replaceState(null, '', window.location.pathname + window.location.search);

  /* Returner fokus til elementet som åpnet modalen */
  if (forrigeAktivtElement) {
    forrigeAktivtElement.focus();
    forrigeAktivtElement = null;
  }
}

export function hentÅpenEvent() {
  return åpenEvent;
}


/* ========================
   INNHOLDSBYGGING (DOM)
   ======================== */

function byggModalInnhold(event) {
  const fragment = document.createDocumentFragment();

  /* Bilde — viser alltid kategoribilde som standard, event.bilde overstyrer */
  {
    const img = document.createElement('img');
    img.src       = hentEventbilde(event);
    img.alt       = '';
    img.className = 'modal-bilde';

    const harEgetBilde  = Boolean(event.bilde);
    const kategoriFallback = KATEGORI_BILDER[event.kategori];

    if (harEgetBilde && kategoriFallback) {
      img.addEventListener('error', () => {
        img.src = kategoriFallback;
        img.addEventListener('error', () => img.remove(), { once: true });
      }, { once: true });
    } else {
      img.addEventListener('error', () => img.remove(), { once: true });
    }

    fragment.appendChild(img);
  }

  /* Hoveddel */
  const body = document.createElement('div');
  body.className = 'modal-body';

  /* Kategori */
  const kategoriSpan = document.createElement('span');
  kategoriSpan.className   = `modal-kategori kategori-${event.kategori}`;
  kategoriSpan.textContent = kategoriVisningsnavn(event.kategori);
  body.appendChild(kategoriSpan);

  /* Tittel */
  const tittel = document.createElement('h2');
  tittel.className   = 'modal-tittel';
  tittel.id          = 'modal-overskrift';
  tittel.textContent = event.tittel;
  body.appendChild(tittel);

  /* Sted + følg-knapp */
  const stedRad = document.createElement('div');
  stedRad.className = 'modal-sted-rad';

  const stedP = document.createElement('p');
  stedP.className   = 'modal-sted';
  stedP.textContent = [event.sted, event.adresse].filter(Boolean).join(' · ');
  stedRad.appendChild(stedP);

  if (event.sted) {
    const fulgtNå   = erFulgt(event.sted);
    const følgKnapp = document.createElement('button');
    følgKnapp.className      = `følg-knapp${fulgtNå ? ' fulgt' : ''}`;
    følgKnapp.dataset.sted   = event.sted;
    følgKnapp.textContent    = fulgtNå ? 'følger ✓' : `+ følg ${event.sted}`;
    følgKnapp.setAttribute('aria-pressed', String(fulgtNå));
    stedRad.appendChild(følgKnapp);
  }

  body.appendChild(stedRad);

  /* Faktarad */
  body.appendChild(byggFaktarad(event));

  /* Beskrivelse */
  if (event.beskrivelse) {
    const besk = document.createElement('p');
    besk.className   = 'modal-beskrivelse';
    besk.textContent = event.beskrivelse;
    body.appendChild(besk);
  }

  /* Kuratortekst */
  if (event.kuratortekst) {
    const kur = document.createElement('p');
    kur.className   = 'modal-kuratortekst';
    kur.textContent = event.kuratortekst;
    body.appendChild(kur);
  }

  /* Handlingsknapper */
  const handlinger = byggHandlinger(event);
  if (handlinger) body.appendChild(handlinger);

  /* Bunnlinje: lagre + del */
  body.appendChild(byggBunn(event));

  /* Tillitssignaler */
  const tillit = byggTillit(event);
  if (tillit) body.appendChild(tillit);

  fragment.appendChild(body);
  return fragment;
}

function formaterGjentas(gjentas) {
  if (!gjentas) return null;
  if (gjentas.startsWith('ukentlig:'))       return `hver ${gjentas.slice(9)}`;
  if (gjentas.startsWith('månedlig:siste-')) return `siste ${gjentas.slice(15)} i mnd`;
  return null;
}

function byggFaktarad(event) {
  const rad = document.createElement('div');
  rad.className = 'modal-faktarad';

  const felt = (etikett, verdi, ekstraKlasse = '') => {
    const div = document.createElement('div');
    div.className = 'faktarad-felt';
    const e = document.createElement('span');
    e.className   = 'faktarad-etikett';
    e.textContent = etikett;
    const v = document.createElement('span');
    v.className   = `faktarad-verdi${ekstraKlasse ? ' ' + ekstraKlasse : ''}`;
    v.textContent = verdi;
    div.appendChild(e);
    div.appendChild(v);
    return div;
  };

  rad.appendChild(felt('Tid', formaterTidKort(event.start)));

  const prisKlasse = (event.pris ?? 0) === 0 && event.pris !== null ? 'pris-gratis' : '';
  rad.appendChild(felt('Pris', formaterPrisTekst(event.pris, event.prisTekst), prisKlasse));

  if (event._avstand != null) {
    rad.appendChild(felt('Avstand', formaterAvstand(event._avstand)));
  }

  const gjentasTekst = formaterGjentas(event.gjentas);
  if (gjentasTekst) {
    rad.appendChild(felt('Gjentas', gjentasTekst));
  }

  return rad;
}

function byggHandlinger(event) {
  const harKart   = event.lat != null && event.lng != null;
  const harLenke  = erGyldigUrl(event.lenke);
  if (!harKart && !harLenke) return null;

  const div = document.createElement('div');
  div.className = 'modal-handlinger';

  if (harKart) {
    const kartLenke = `https://www.google.com/maps/search/?api=1&query=${event.lat},${event.lng}`;
    const a = document.createElement('a');
    a.href      = kartLenke;
    a.target    = '_blank';
    a.rel       = 'noopener noreferrer';
    a.className = 'knapp knapp-sekundaer';
    a.textContent = 'vis på kart';
    div.appendChild(a);
  }

  if (harLenke) {
    const a = document.createElement('a');
    a.href      = event.lenke;
    a.target    = '_blank';
    a.rel       = 'noopener noreferrer';
    a.className = 'knapp knapp-primaer';
    a.textContent = 'mer info / billett';
    a.addEventListener('click', () => trackEvent('mer_info_klikket', { id: event.id }), { once: true });
    div.appendChild(a);
  }

  return div;
}

function byggBunn(event) {
  const div = document.createElement('div');
  div.className = 'modal-bunn';

  /* Lagre-knapp */
  const lagretNå = erLagret(event.id);
  const hjerteKnapp = document.createElement('button');
  hjerteKnapp.className = `knapp-ghost modal-hjerte${lagretNå ? ' lagret' : ''}`;
  hjerteKnapp.dataset.id = event.id;
  hjerteKnapp.innerHTML = `${BINDERS_SVG_SM} <span class="modal-hjerte-tekst">${lagretNå ? 'lagret' : 'lagre'}</span>`;
  hjerteKnapp.setAttribute('aria-pressed', String(lagretNå));
  div.appendChild(hjerteKnapp);

  /* Del-knapp */
  const delKnapp = document.createElement('button');
  delKnapp.className   = 'knapp-ghost del-knapp';
  delKnapp.textContent = 'del';
  div.appendChild(delKnapp);

  return div;
}

function byggTillit(event) {
  const verifisert  = formaterVerifisert(event.sistVerifisert);
  const harFeedback = erGyldigUrl(KONFIG.feedbackUrl);

  if (!verifisert && !harFeedback) return null;

  const div = document.createElement('div');
  div.className = 'modal-tillit';

  if (verifisert) {
    const p = document.createElement('p');
    p.className   = 'tillit-verifisert';
    p.textContent = `✓ ${verifisert}`;
    div.appendChild(p);
  }

  if (harFeedback) {
    const a = document.createElement('a');
    a.href      = KONFIG.feedbackUrl;
    a.target    = '_blank';
    a.rel       = 'noopener noreferrer';
    a.className = 'tillit-feedback';
    a.textContent = 'Fant du en feil?';
    div.appendChild(a);
  }

  return div;
}


/* ========================
   HENDELSELYTTERE
   ======================== */

function leggTilModalLyttere(event) {
  document.querySelector('.modal-hjerte').addEventListener('click', (e) => {
    const erNåLagret = veksleLagret(event.id);
    e.currentTarget.classList.toggle('lagret', erNåLagret);
    e.currentTarget.querySelector('.modal-hjerte-tekst').textContent = erNåLagret ? 'lagret' : 'lagre';
    e.currentTarget.setAttribute('aria-pressed', String(erNåLagret));

    /* Oppdater hjertene i feeden bak modalen */
    synkroniserKortHjerte(event.id, erNåLagret);

    /* Informer main.js (f.eks. for lagret-visning) */
    document.dispatchEvent(new CustomEvent('paaby:lagret-endret', {
      detail: { id: event.id, lagret: erNåLagret },
    }));
  });

  const følgKnapp = document.querySelector('.følg-knapp');
  if (følgKnapp) {
    følgKnapp.addEventListener('click', () => {
      const sted       = følgKnapp.dataset.sted;
      const erNåFulgt  = veksleFulgt(sted);
      følgKnapp.classList.toggle('fulgt', erNåFulgt);
      følgKnapp.textContent = erNåFulgt ? 'følger ✓' : `+ følg ${sted}`;
      følgKnapp.setAttribute('aria-pressed', String(erNåFulgt));

      /* Sporing: kun når man begynner å følge, ikke ved avfølging
         (samme prinsipp som event_lagret over — track opt-in, ikke opt-out) */
      if (erNåFulgt) trackEvent('sted_fulgt', { sted });
    });
  }

  document.querySelector('.del-knapp').addEventListener('click', (e) => {
    delEvent(event, e.currentTarget);
  });
}

async function delEvent(event, knapp) {
  trackEvent('event_delt', { id: event.id });
  const base  = KONFIG.prodDomene || window.location.origin;
  const path  = window.location.pathname;
  const delUrl = `${base}${path}#event/${encodeURIComponent(event.id)}`;

  const tekst = `${event.tittel} @ ${event.sted} — ${delUrl}`;

  if (navigator.share) {
    try {
      await navigator.share({ title: event.tittel, text: tekst, url: delUrl });
    } catch {
      /* Brukeren avbrøt — ikke vis feil */
    }
    return;
  }

  try {
    await navigator.clipboard.writeText(delUrl);
    knapp.textContent = 'lenke kopiert!';
    setTimeout(() => { knapp.textContent = 'del'; }, 2000);
  } catch {
    window.prompt('Kopier denne lenken:', delUrl);
  }
}


/* ========================
   FOKUS-FELLE
   ======================== */

function håndterFokusFelle(e) {
  if (e.key !== 'Tab') return;
  const modal = document.getElementById('modal');
  const fokuserbare = Array.from(modal.querySelectorAll(
    'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
  )).filter((el) => el.offsetParent !== null); /* kun synlige */

  if (fokuserbare.length === 0) return;
  const første = fokuserbare[0];
  const siste  = fokuserbare[fokuserbare.length - 1];

  if (e.shiftKey && document.activeElement === første) {
    e.preventDefault();
    siste.focus();
  } else if (!e.shiftKey && document.activeElement === siste) {
    e.preventDefault();
    første.focus();
  }
}


/* ========================
   DRA-FOR-Å-LUKKE (mobil bunnark)
   Lar brukeren dra arket ned med fingeren for å lukke det — i tillegg til
   kryss-knappen, klikk på bakgrunn og Escape. Kun aktiv når modalen vises
   som bunnark (< 640px — matcher CSS-brytpunktet i «MODAL DESKTOP», der
   den blir et sentrert vindu uten denne gesten). Griper bare inn ved
   nedover-drag når innholdet allerede er scrollet helt til toppen, slik
   at vanlig scrolling i beskrivelsen ikke forstyrres.
   ======================== */

const DRA_LUKK_TERSKEL_PX  = 100;  /* dra lenger enn dette → lukk */
const DRA_LUKK_HASTIGHET   = 0.5;  /* px/ms — rask swipe lukker uansett avstand */
const DRA_DØDSONE_PX       = 8;    /* skiller drag fra vanlig tap/klikk */
const BUNNARK_MAKS_BREDDE  = 639;  /* matcher @media (min-width: 640px) i CSS */

function initDraForÅLukke() {
  const modal     = document.getElementById('modal');
  const container = modal.querySelector('.modal-container');

  let startY   = null;
  let startTid = 0;
  let dragging = false;
  let pekerId  = null;

  function fullførDrag(deltaY, hurtig) {
    container.style.transition = 'transform 0.25s ease';

    if (deltaY > DRA_LUKK_TERSKEL_PX || hurtig) {
      container.style.transform = 'translateY(100%)';
      lukkModal();
    } else {
      container.style.transform = 'translateY(0)';
    }

    const ryddOpp = () => {
      /* Tilbake til ren CSS-styring (klasse-basert transform) til neste åpning */
      container.style.transition = '';
      container.style.transform  = '';
      container.removeEventListener('transitionend', ryddOpp);
    };
    container.addEventListener('transitionend', ryddOpp);
  }

  container.addEventListener('pointerdown', (e) => {
    if (window.innerWidth > BUNNARK_MAKS_BREDDE) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (container.scrollTop > 0) return; /* kun ved toppen av innholdet */

    startY   = e.clientY;
    startTid = performance.now();
    dragging = false;
    pekerId  = e.pointerId;

    /* Slår av nettleserens egne touch-gester (scroll/bounce) FØR første
       move-hendelse i det hele tatt når vi allerede vet vi er ved toppen —
       venter vi til pointermove med bare preventDefault(), rekker mobil-
       nettlesere (spesielt iOS Safari) å starte sin egen scroll/bounce-
       gest først, og den vinner over transform-en vår («popper rett opp
       igjen»). Nullstilles i avslutt() under. */
    container.style.touchAction = 'none';
  });

  container.addEventListener('pointermove', (e) => {
    if (pekerId === null || e.pointerId !== pekerId || startY === null) return;

    const deltaY = e.clientY - startY;
    if (deltaY <= 0) return; /* kun nedover-drag lukker */

    if (!dragging) {
      if (deltaY < DRA_DØDSONE_PX) return;
      dragging = true;
      container.style.transition = 'none';
      try { container.setPointerCapture(pekerId); } catch { /* ignorer */ }
    }

    e.preventDefault();
    container.style.transform = `translateY(${deltaY}px)`;
  }, { passive: false });

  function avslutt(e) {
    if (pekerId === null || e.pointerId !== pekerId) return;

    if (dragging) {
      const deltaY   = Math.max(0, e.clientY - startY);
      const varighet = performance.now() - startTid;
      const hurtig   = deltaY > 20 && (deltaY / Math.max(varighet, 1)) > DRA_LUKK_HASTIGHET;
      fullførDrag(deltaY, hurtig);
    }

    container.style.touchAction = '';
    dragging = false;
    pekerId  = null;
    startY   = null;
  }

  container.addEventListener('pointerup', avslutt);
  container.addEventListener('pointercancel', avslutt);
}


/* ========================
   INITIALISERING
   ======================== */

export function initModal() {
  const modal     = document.getElementById('modal');
  const lukkKnapp = document.getElementById('modal-lukk');

  lukkKnapp.addEventListener('click', lukkModal);

  /* Klikk på bakgrunn (selve overlay-en) lukker modal */
  modal.addEventListener('click', (e) => {
    if (e.target === modal) lukkModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && åpenEvent) lukkModal();
  });

  /* Fokus-felle — holder Tab innenfor modalen */
  modal.addEventListener('keydown', håndterFokusFelle);

  initDraForÅLukke();
}
