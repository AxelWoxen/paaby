/* send-inn.js — skjemalogikk for /send-inn/.
   Bygger ingen DOM med brukerdata via innerHTML (kun tekstContent/verdier på
   egne, statiske elementer i send-inn/index.html) — samme XSS-praksis som
   resten av appen. All ekte validering skjer på serveren; valideringen her
   er kun for rask tilbakemelding.

   Flere events i samme økt: hvert "Legg til event" lagrer et utkast i et
   in-memory array (ikke sendt til serveren før endelig innsending).
   "Om deg" fylles kun én gang og gjelder for alle utkastene. Ved endelig
   innsending POSTes hvert utkast som egen request mot det eksisterende
   /api/innsendinger-endepunktet (samme payload-form som tidligere) — ingen
   batch-API, ingen endring i event_candidates-modellen. */

import { aktiverSporing, trackEvent } from '../application/sporing.js';
import { erGyldigUrl }                from '../application/validering.js';

/* Samme samtykke-sjekk som js/main.js gjør ved oppstart — denne siden laster
   ikke main.js, så uten dette ville trackEvent('event_innsendt', …) aldri
   nådd frem for brukere som allerede har samtykket på forsiden. */
if (localStorage.getItem('paaby-samtykke') === 'ja') {
  aktiverSporing();
}

const API_BASE_URL =
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : 'https://api.paaby.no';

const MAKS_BILDE_PX     = 1600;
const BILDE_KVALITET    = 0.85;
const MAKS_BESKRIVELSE  = 500;
const MAKS_KOMMENTAR    = 1000;

/* ========================
   ELEMENTER
   ======================== */

const oversiktView = document.getElementById('oversikt-view');
const skjemaView    = document.getElementById('skjema-view');
const bekreftelseEl = document.getElementById('bekreftelse');
const fotnoteEl      = document.getElementById('send-inn-fotnote');

const eventgrid     = document.getElementById('eventgrid');
const omdegBoks      = document.getElementById('omdeg-boks');
const sendAlleKnapp  = document.getElementById('send-alle-knapp');

const skjema         = document.getElementById('innsending-skjema');
const leggTilKnapp   = document.getElementById('legg-til-knapp');
const skjemaTilbakeKnapp = document.getElementById('skjema-tilbake-knapp');

const kategoriInput   = document.getElementById('kategori');
const kategoriKnapper = document.querySelectorAll('.send-inn-kategori-velger .kategori-chip');

const bildeFilInput        = document.getElementById('bilde-fil');
const bildeLenkeInput      = document.getElementById('bilde-lenke');
const bildeForhandsvisning = document.getElementById('bilde-forhandsvisning');
const bildePlaceholder     = document.getElementById('bilde-placeholder');

const prisKrInput   = document.getElementById('pris-kr');
const gjentasType   = document.getElementById('gjentas-type');
const gjentasDag    = document.getElementById('gjentas-dag');

const navnInput         = document.getElementById('navn');
const organisasjonInput = document.getElementById('organisasjon');
const kontaktInput      = document.getElementById('kontakt');
const kommentarInput    = document.getElementById('kommentar');
const bekreftInput      = document.getElementById('bekreft');
const nettsideInput     = document.getElementById('nettside'); // honeypot, delt

/* ========================
   TILSTAND
   ======================== */

/* Ett utkast = alle felt for ett event + status for innsending.
   bildeBlob/bildeForhandsvisningUrl holder prosessert bilde lokalt helt til
   endelig innsending. serverId settes først når POST-en faktisk lykkes —
   brukes til å hindre dobbeltinnsending ved retry. */
let utkast = [];
let redigererUtkastId = null; // null = nytt utkast, ellers id på utkastet som redigeres
let bearbeidetBildeBlob = null; // bilde for utkastet som redigeres akkurat nå

function nyttUtkast() {
  return {
    utkastId: crypto.randomUUID(),
    kategori: '', tittel: '', sted: '', adresse: '',
    dato: '', startTid: '', sluttTid: '',
    gjentasType: '', gjentasDag: 'søndag',
    prisType: 'gratis', prisKr: '', prisTekst: '',
    beskrivelse: '', lenke: '',
    bildeBlob: null, bildeLenke: '', bildeForhandsvisningUrl: null,
    status: 'utkast', // 'utkast' | 'sendt' | 'feilet'
    serverId: null,
    serverFeil: null,
  };
}

/* ========================
   VISNING — bytt mellom oversikt / skjema / suksess
   ======================== */

function visOversikt() {
  skjemaView.hidden = true;
  bekreftelseEl.hidden = true;
  oversiktView.hidden = false;
  fotnoteEl.hidden = false;
  renderOversikt();
}

function visSkjema() {
  oversiktView.hidden = true;
  fotnoteEl.hidden = true;
  skjemaView.hidden = false;
}

function visSuksess(antallSendt) {
  oversiktView.hidden = true;
  skjemaView.hidden = true;
  fotnoteEl.hidden = true;
  document.getElementById('bekreftelse-tekst').textContent = antallSendt === 1
    ? 'Takk! Vi har fått inn eventet ditt. Vi går gjennom det før det eventuelt publiseres på Påby.'
    : `Takk! Vi har fått inn ${antallSendt} events. Vi går gjennom dem før de eventuelt publiseres på Påby.`;
  bekreftelseEl.hidden = false;
}

/* ========================
   OVERSIKT — render eventgrid + "Om deg"
   ======================== */

const UKEDAGER_KORT = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'];
const MANEDER_KORT  = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];

function formatterDatoTid(datoStr, tidStr) {
  const m = datoStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const [, årStr, manedStr, dagStr] = m;
  const år = Number(årStr), maned = Number(manedStr), dag = Number(dagStr);
  const ukedag = new Date(Date.UTC(år, maned - 1, dag)).getUTCDay();
  const del = `${UKEDAGER_KORT[ukedag]}. ${dag}. ${MANEDER_KORT[maned - 1]}`;
  return tidStr ? `${del} · ${tidStr}` : del;
}

function byggBildeKildeForUtkast(u) {
  if (u.bildeForhandsvisningUrl) return u.bildeForhandsvisningUrl;
  if (u.bildeLenke) return u.bildeLenke;
  return null;
}

function renderOversikt() {
  eventgrid.innerHTML = '';

  utkast.forEach((u) => {
    const kort = document.createElement('div');
    kort.className = 'send-inn-eventkort' + (u.status === 'sendt' ? ' send-inn-eventkort--sendt' : '');
    kort.setAttribute('role', 'button');
    kort.setAttribute('tabindex', '0');

    const bildeWrapper = document.createElement('div');
    bildeWrapper.className = 'send-inn-eventkort-bilde-wrapper';
    const bildeKilde = byggBildeKildeForUtkast(u);
    if (bildeKilde) {
      const img = document.createElement('img');
      img.src = bildeKilde;
      img.alt = '';
      bildeWrapper.appendChild(img);
    } else {
      const placeholder = document.createElement('p');
      placeholder.className = 'send-inn-eventkort-placeholder';
      placeholder.textContent = 'Ingen bilde';
      bildeWrapper.appendChild(placeholder);
    }
    kort.appendChild(bildeWrapper);

    const innhold = document.createElement('div');
    innhold.className = 'send-inn-eventkort-innhold';

    const tittel = document.createElement('p');
    tittel.className = 'send-inn-eventkort-tittel';
    tittel.textContent = u.tittel || 'Uten tittel';
    innhold.appendChild(tittel);

    const meta = document.createElement('p');
    meta.className = 'send-inn-eventkort-meta';
    meta.textContent = formatterDatoTid(u.dato, u.startTid);
    innhold.appendChild(meta);

    if (u.sted) {
      const sted = document.createElement('p');
      sted.className = 'send-inn-eventkort-sted';
      sted.textContent = u.sted;
      innhold.appendChild(sted);
    }

    if (u.status === 'sendt') {
      const status = document.createElement('p');
      status.className = 'send-inn-eventkort-status send-inn-eventkort-status--sendt';
      status.textContent = 'Sendt ✓';
      innhold.appendChild(status);
    } else if (u.status === 'feilet') {
      const status = document.createElement('p');
      status.className = 'send-inn-eventkort-status send-inn-eventkort-status--feilet';
      status.textContent = u.serverFeil ? `Feilet: ${u.serverFeil}` : 'Feilet — prøv igjen';
      innhold.appendChild(status);
    }

    kort.appendChild(innhold);

    if (u.status !== 'sendt') {
      const fjernKnapp = document.createElement('button');
      fjernKnapp.type = 'button';
      fjernKnapp.className = 'send-inn-eventkort-fjern';
      fjernKnapp.setAttribute('aria-label', `Fjern ${u.tittel || 'eventet'}`);
      fjernKnapp.textContent = '×';
      fjernKnapp.addEventListener('click', (e) => {
        e.stopPropagation();
        fjernUtkast(u.utkastId);
      });
      kort.appendChild(fjernKnapp);

      const åpneRedigering = () => åpneSkjemaForRedigering(u.utkastId);
      kort.addEventListener('click', åpneRedigering);
      kort.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); åpneRedigering(); }
      });
    }

    eventgrid.appendChild(kort);
  });

  const leggTilKort = document.createElement('button');
  leggTilKort.type = 'button';
  leggTilKort.className = 'send-inn-legg-til-kort';
  leggTilKort.innerHTML = '<span class="send-inn-legg-til-plus" aria-hidden="true">+</span><span>Legg til event</span>';
  leggTilKort.addEventListener('click', åpneSkjemaForNyttUtkast);
  eventgrid.appendChild(leggTilKort);

  const sendbareUtkast = utkast.filter((u) => u.status !== 'sendt');
  omdegBoks.hidden = utkast.length === 0;
  if (sendbareUtkast.length === 0) {
    sendAlleKnapp.textContent = 'Send inn event';
  } else if (utkast.some((u) => u.status === 'feilet')) {
    sendAlleKnapp.textContent = `Prøv igjen (${sendbareUtkast.length})`;
  } else {
    sendAlleKnapp.textContent = sendbareUtkast.length === 1
      ? 'Send inn event'
      : `Send inn ${sendbareUtkast.length} events`;
  }
}

function fjernUtkast(utkastId) {
  utkast = utkast.filter((u) => u.utkastId !== utkastId);
  renderOversikt();
}

/* ========================
   SKJEMA — fyll ut fra utkast / tomt, og skriv tilbake til utkast
   ======================== */

function fyllSkjemaFraUtkast(u) {
  kategoriKnapper.forEach((b) => {
    const aktiv = b.dataset.kategori === u.kategori;
    b.classList.toggle('aktiv', aktiv);
    b.setAttribute('aria-pressed', String(aktiv));
  });
  kategoriInput.value = u.kategori;
  if (u.kategori) skjema.dataset.kategori = u.kategori; else delete skjema.dataset.kategori;

  document.getElementById('tittel').value = u.tittel;
  document.getElementById('sted').value = u.sted;
  document.getElementById('adresse').value = u.adresse;
  document.getElementById('dato').value = u.dato;
  document.getElementById('start-tid').value = u.startTid;
  document.getElementById('slutt-tid').value = u.sluttTid;

  gjentasType.value = u.gjentasType;
  gjentasDag.value = u.gjentasDag;
  gjentasDag.hidden = !u.gjentasType;

  document.querySelectorAll('input[name="prisType"]').forEach((radio) => {
    radio.checked = radio.value === u.prisType;
  });
  prisKrInput.hidden = u.prisType !== 'kr';
  prisKrInput.value = u.prisKr;
  document.getElementById('pris-tekst').value = u.prisTekst;

  document.getElementById('beskrivelse').value = u.beskrivelse;
  document.getElementById('beskrivelse-teller').textContent = String(u.beskrivelse.length);
  document.getElementById('lenke').value = u.lenke;

  bildeFilInput.value = '';
  bildeLenkeInput.value = u.bildeLenke;
  bearbeidetBildeBlob = u.bildeBlob;
  const forhandsvisning = byggBildeKildeForUtkast(u);
  if (forhandsvisning) visBildeForhandsvisning(forhandsvisning);
  else skjulBildeForhandsvisning();

  fjernAlleEventFeil();
}

function lesSkjemaInnIUtkast(u) {
  u.kategori = kategoriInput.value;
  u.tittel = felt('tittel');
  u.sted = felt('sted');
  u.adresse = felt('adresse');
  u.dato = document.getElementById('dato').value;
  u.startTid = document.getElementById('start-tid').value;
  u.sluttTid = document.getElementById('slutt-tid').value;
  u.gjentasType = gjentasType.value;
  u.gjentasDag = gjentasDag.value;
  u.prisType = document.querySelector('input[name="prisType"]:checked')?.value ?? '';
  u.prisKr = document.getElementById('pris-kr').value;
  u.prisTekst = felt('pris-tekst');
  u.beskrivelse = felt('beskrivelse');
  u.lenke = felt('lenke');
  u.bildeLenke = felt('bilde-lenke');
  u.bildeBlob = bearbeidetBildeBlob;
  u.bildeForhandsvisningUrl = bearbeidetBildeBlob ? URL.createObjectURL(bearbeidetBildeBlob) : null;
}

function åpneSkjemaForNyttUtkast() {
  redigererUtkastId = null;
  bearbeidetBildeBlob = null;
  const u = nyttUtkast();

  // Gjenbruk sted/adresse fra forrige utkast — redusert friksjon for samme
  // arrangør/venue, men lett å overskrive siden feltene forblir vanlige
  // tekstfelt.
  const forrige = utkast[utkast.length - 1];
  if (forrige) {
    u.sted = forrige.sted;
    u.adresse = forrige.adresse;
  }

  fyllSkjemaFraUtkast(u);
  leggTilKnapp.textContent = 'Legg til event';
  visSkjema();
}

function åpneSkjemaForRedigering(utkastId) {
  const u = utkast.find((x) => x.utkastId === utkastId);
  if (!u) return;
  redigererUtkastId = utkastId;
  fyllSkjemaFraUtkast(u);
  leggTilKnapp.textContent = 'Lagre endringer';
  visSkjema();
}

skjemaTilbakeKnapp.addEventListener('click', () => {
  visOversikt();
});

/* ========================
   KATEGORI-VELGER
   ======================== */

kategoriKnapper.forEach((knapp) => {
  knapp.addEventListener('click', () => {
    kategoriKnapper.forEach((b) => {
      b.classList.remove('aktiv');
      b.setAttribute('aria-pressed', 'false');
    });
    knapp.classList.add('aktiv');
    knapp.setAttribute('aria-pressed', 'true');
    kategoriInput.value = knapp.dataset.kategori;
    // Settes på selve <form>-en, ikke bare kortet — send-knappen ligger
    // utenfor kortet og trenger samme --kort-farge (se css/stil.css).
    skjema.dataset.kategori = knapp.dataset.kategori;
    settEventFeil('kategori', '');
  });
});

/* ========================
   PRIS / GJENTAS — vis/skjul avhengige felt
   ======================== */

document.querySelectorAll('input[name="prisType"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    const valgt = document.querySelector('input[name="prisType"]:checked')?.value;
    prisKrInput.hidden = valgt !== 'kr';
    settEventFeil('prisType', '');
  });
});

gjentasType.addEventListener('change', () => {
  gjentasDag.hidden = !gjentasType.value;
});

/* ========================
   TEGNTELLERE
   ======================== */

function bindTeller(feltId, tellerId) {
  const felt   = document.getElementById(feltId);
  const teller = document.getElementById(tellerId);
  const oppdater = () => { teller.textContent = String(felt.value.length); };
  felt.addEventListener('input', oppdater);
  oppdater();
}
bindTeller('beskrivelse', 'beskrivelse-teller');
bindTeller('kommentar', 'kommentar-teller');

/* ========================
   BILDE — krymping i nettleseren (canvas, maks 1600px, JPEG 0.85)
   ======================== */

function krympBilde(fil) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(fil);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;
      if (width > MAKS_BILDE_PX || height > MAKS_BILDE_PX) {
        if (width >= height) {
          height = Math.round(height * (MAKS_BILDE_PX / width));
          width  = MAKS_BILDE_PX;
        } else {
          width  = Math.round(width * (MAKS_BILDE_PX / height));
          height = MAKS_BILDE_PX;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width  = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas støttes ikke'));
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error('Kunne ikke behandle bildet'));
        resolve(blob);
      }, 'image/jpeg', BILDE_KVALITET);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Kunne ikke lese bildet'));
    };

    img.src = url;
  });
}

function visBildeForhandsvisning(src) {
  bildeForhandsvisning.src = src;
  bildeForhandsvisning.hidden = false;
  bildePlaceholder.hidden = true;
}

function skjulBildeForhandsvisning() {
  bildeForhandsvisning.hidden = true;
  bildeForhandsvisning.removeAttribute('src');
  bildePlaceholder.hidden = false;
}

bildeFilInput.addEventListener('change', async () => {
  const fil = bildeFilInput.files[0];
  settEventFeil('bilde', '');

  if (!fil) {
    bearbeidetBildeBlob = null;
    if (!bildeLenkeInput.value.trim()) skjulBildeForhandsvisning();
    return;
  }

  try {
    bearbeidetBildeBlob = await krympBilde(fil);
    visBildeForhandsvisning(URL.createObjectURL(bearbeidetBildeBlob));
  } catch {
    bearbeidetBildeBlob = null;
    settEventFeil('bilde', 'Kunne ikke lese dette bildet. Prøv et annet (JPEG/PNG/WebP).');
  }
});

bildeLenkeInput.addEventListener('input', () => {
  if (bearbeidetBildeBlob) return; // opplastet fil har forrang på forhåndsvisningen
  const url = bildeLenkeInput.value.trim();
  settEventFeil('bildeLenke', '');
  if (!url) { skjulBildeForhandsvisning(); return; }

  const probe = new Image();
  probe.onload  = () => visBildeForhandsvisning(url);
  probe.onerror = () => { /* valideres og vises som feil ved innsending */ };
  probe.src = url;
});

/* ========================
   FEILVISNING
   ======================== */

function settEventFeil(felt, melding) {
  const el = skjemaView.querySelector(`[data-feil-for="${felt}"]`);
  if (el) el.textContent = melding ?? '';
}

function settOmDegFeil(felt, melding) {
  const el = omdegBoks.querySelector(`[data-feil-for="${felt}"]`);
  if (el) el.textContent = melding ?? '';
}

function fjernAlleEventFeil() {
  skjemaView.querySelectorAll('.send-inn-feil').forEach((el) => { el.textContent = ''; });
}

function fjernAlleOmDegFeil() {
  omdegBoks.querySelectorAll('.send-inn-feil').forEach((el) => { el.textContent = ''; });
}

function visEventFeil(feilObjekt) {
  let førsteFelt = null;
  Object.entries(feilObjekt).forEach(([felt, melding]) => {
    settEventFeil(felt, melding);
    if (!førsteFelt) førsteFelt = felt;
  });
  if (førsteFelt) {
    skjemaView.querySelector(`[data-feil-for="${førsteFelt}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function visOmDegFeil(feilObjekt) {
  let førsteFelt = null;
  Object.entries(feilObjekt).forEach(([felt, melding]) => {
    settOmDegFeil(felt, melding);
    if (!førsteFelt) førsteFelt = felt;
  });
  if (førsteFelt) {
    omdegBoks.querySelector(`[data-feil-for="${førsteFelt}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

/* ========================
   KLIENT-VALIDERING (kun rask tilbakemelding — serveren er autoritativ)
   ======================== */

function validerEventKlient() {
  const feil = {};

  if (!kategoriInput.value) feil.kategori = 'Velg en kategori.';
  if (!felt('tittel')) feil.tittel = 'Tittel er påkrevd.';
  if (!felt('sted')) feil.sted = 'Sted er påkrevd.';
  if (!felt('adresse')) feil.adresse = 'Adresse er påkrevd.';
  if (!document.getElementById('dato').value) feil.dato = 'Dato er påkrevd.';
  if (!document.getElementById('start-tid').value) feil.startTid = 'Starttid er påkrevd.';

  const prisType = document.querySelector('input[name="prisType"]:checked')?.value;
  if (prisType === 'kr') {
    const prisKr = document.getElementById('pris-kr').value;
    if (prisKr === '' || Number(prisKr) < 0) feil.prisKr = 'Oppgi en gyldig pris i kroner.';
  }

  const beskrivelse = felt('beskrivelse');
  if (!beskrivelse) feil.beskrivelse = 'Beskrivelse er påkrevd.';
  else if (beskrivelse.length > MAKS_BESKRIVELSE) feil.beskrivelse = `Maks ${MAKS_BESKRIVELSE} tegn.`;

  const lenke = felt('lenke');
  if (lenke && !erGyldigUrl(lenke)) feil.lenke = 'Lenken må starte med https://.';

  const bildeLenke = felt('bilde-lenke');
  if (bildeLenke && !erGyldigUrl(bildeLenke)) feil.bildeLenke = 'Bildelenken må starte med https://.';

  return feil;
}

function validerOmDegKlient() {
  const feil = {};
  if (!navnInput.value.trim()) feil.navn = 'Navn er påkrevd.';
  if (!kontaktInput.value.trim()) feil.kontakt = 'Oppgi e-post eller Instagram-brukernavn.';
  if (kommentarInput.value.length > MAKS_KOMMENTAR) feil.kommentar = `Maks ${MAKS_KOMMENTAR} tegn.`;
  if (!bekreftInput.checked) feil.bekreft = 'Du må bekrefte at informasjonen stemmer.';
  return feil;
}

function felt(id) {
  return document.getElementById(id).value.trim();
}

/* ========================
   "LEGG TIL EVENT" / "LAGRE ENDRINGER" — lagrer utkastet lokalt
   ======================== */

skjema.addEventListener('submit', (e) => {
  e.preventDefault();
  fjernAlleEventFeil();

  const feil = validerEventKlient();
  if (Object.keys(feil).length > 0) {
    visEventFeil(feil);
    return;
  }

  const u = redigererUtkastId
    ? utkast.find((x) => x.utkastId === redigererUtkastId)
    : nyttUtkast();

  lesSkjemaInnIUtkast(u);
  u.status = 'utkast';
  u.serverFeil = null;

  if (!redigererUtkastId) utkast.push(u);

  visOversikt();
});

/* ========================
   ENDELIG INNSENDING — poster hvert ikke-sendte utkast som egen request
   mot /api/innsendinger. Allerede sendte utkast røres aldri igjen, så en
   retry etter delvis feil sender kun de som faktisk feilet.
   ======================== */

function byggFormDataForUtkast(u, omDeg) {
  const fd = new FormData();
  fd.append('nettside', nettsideInput.value);
  fd.append('kategori', u.kategori);
  fd.append('tittel', u.tittel);
  fd.append('sted', u.sted);
  fd.append('adresse', u.adresse);
  fd.append('dato', u.dato);
  fd.append('startTid', u.startTid);
  fd.append('sluttTid', u.sluttTid);
  fd.append('gjentasType', u.gjentasType);
  fd.append('gjentasDag', u.gjentasDag);
  fd.append('prisType', u.prisType);
  fd.append('prisKr', u.prisKr);
  fd.append('prisTekst', u.prisTekst);
  fd.append('beskrivelse', u.beskrivelse);
  fd.append('lenke', u.lenke);
  fd.append('bildeLenke', u.bildeLenke);
  fd.append('kommentar', omDeg.kommentar);
  fd.append('navn', omDeg.navn);
  fd.append('organisasjon', omDeg.organisasjon);
  fd.append('kontakt', omDeg.kontakt);
  fd.append('bekreft', omDeg.bekreft ? 'true' : 'false');
  if (u.bildeBlob) fd.append('bilde', u.bildeBlob, 'bilde.jpg');
  return fd;
}

async function sendUtkast(u, omDeg) {
  try {
    const res  = await fetch(`${API_BASE_URL}/api/innsendinger`, {
      method: 'POST',
      body: byggFormDataForUtkast(u, omDeg),
    });
    const data = await res.json().catch(() => ({}));

    if (res.ok && data.ok) {
      u.status = 'sendt';
      u.serverId = data.id ?? null;
      u.serverFeil = null;
      return true;
    }

    if (data.feil && typeof data.feil === 'object') {
      u.serverFeil = Object.values(data.feil)[0] ?? 'Ugyldige verdier.';
    } else {
      u.serverFeil = data.message || 'Noe gikk galt.';
    }
    u.status = 'feilet';
    return false;
  } catch {
    u.status = 'feilet';
    u.serverFeil = 'Kunne ikke nå serveren.';
    return false;
  }
}

sendAlleKnapp.addEventListener('click', async () => {
  fjernAlleOmDegFeil();

  const omDegFeil = validerOmDegKlient();
  if (Object.keys(omDegFeil).length > 0) {
    visOmDegFeil(omDegFeil);
    return;
  }

  const omDeg = {
    navn: navnInput.value.trim(),
    organisasjon: organisasjonInput.value.trim(),
    kontakt: kontaktInput.value.trim(),
    kommentar: kommentarInput.value.trim(),
    bekreft: bekreftInput.checked,
  };

  const uSendes = utkast.filter((u) => u.status !== 'sendt');
  if (uSendes.length === 0) return;

  sendAlleKnapp.disabled = true;
  const opprinneligTekst = sendAlleKnapp.textContent;
  sendAlleKnapp.textContent = 'Sender inn …';

  for (const u of uSendes) {
    u.status = 'sender';
    await sendUtkast(u, omDeg);
  }

  sendAlleKnapp.disabled = false;
  sendAlleKnapp.textContent = opprinneligTekst;

  const antallFeilet = utkast.filter((u) => u.status === 'feilet').length;
  if (antallFeilet === 0) {
    trackEvent('event_innsendt', { antall: utkast.length });
    visSuksess(utkast.length);
  } else {
    settOmDegFeil('generelt', antallFeilet === 1
      ? 'Ett event kunne ikke sendes inn. Prøv igjen under.'
      : `${antallFeilet} events kunne ikke sendes inn. Prøv igjen under.`);
    renderOversikt();
  }
});

/* ========================
   START
   ======================== */

visOversikt();
