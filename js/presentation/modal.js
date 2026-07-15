/* modal.js — presentasjonslaget for detaljvisning.
   Bygger DOM-elementer direkte (ingen innerHTML med brukerdata) for å unngå XSS.
   Håndterer fokus-felle, hash-ruting og synkronisering av lagret-tilstand. */

import { erLagret, veksleLagret }                     from '../application/lagret.js';
import { formaterPrisTekst, formaterTidKort,
         formaterAvstand, formaterVerifisert,
         kategoriVisningsnavn }                        from '../application/formatering.js';
import { erGyldigUrl }                                 from '../application/validering.js';
import { hentEventbilde, KATEGORI_BILDER }             from '../application/kategori-bilder.js';
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

  /* Sted */
  const stedTekst = [event.sted, event.adresse].filter(Boolean).join(' · ');
  const sted = document.createElement('p');
  sted.className   = 'modal-sted';
  sted.textContent = stedTekst;
  body.appendChild(sted);

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
  hjerteKnapp.className = 'knapp-ghost modal-hjerte';
  hjerteKnapp.dataset.id = event.id;
  hjerteKnapp.textContent = lagretNå ? '♥ lagret' : '♡ lagre';
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
    e.currentTarget.textContent = erNåLagret ? '♥ lagret' : '♡ lagre';
    e.currentTarget.setAttribute('aria-pressed', String(erNåLagret));

    /* Oppdater hjertene i feeden bak modalen */
    synkroniserKortHjerte(event.id, erNåLagret);

    /* Informer main.js (f.eks. for lagret-visning) */
    document.dispatchEvent(new CustomEvent('paaby:lagret-endret', {
      detail: { id: event.id, lagret: erNåLagret },
    }));
  });

  document.querySelector('.del-knapp').addEventListener('click', (e) => {
    delEvent(event, e.currentTarget);
  });
}

async function delEvent(event, knapp) {
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
}
