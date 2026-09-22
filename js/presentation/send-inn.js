/* send-inn.js — skjemalogikk for /send-inn/.
   Bygger ingen DOM med brukerdata via innerHTML (kun tekstContent/verdier på
   egne, statiske elementer i send-inn/index.html) — samme XSS-praksis som
   resten av appen. All ekte validering skjer på serveren; valideringen her
   er kun for rask tilbakemelding. */

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

const skjema        = document.getElementById('innsending-skjema');
const kategoriInput  = document.getElementById('kategori');
const kategoriKnapper = document.querySelectorAll('.send-inn-kategori-velger .kategori-chip');

const bildeFilInput        = document.getElementById('bilde-fil');
const bildeLenkeInput      = document.getElementById('bilde-lenke');
const bildeForhandsvisning = document.getElementById('bilde-forhandsvisning');
const bildePlaceholder     = document.getElementById('bilde-placeholder');

const prisKrInput   = document.getElementById('pris-kr');
const gjentasType   = document.getElementById('gjentas-type');
const gjentasDag    = document.getElementById('gjentas-dag');

const sendKnapp     = document.getElementById('send-knapp');
const bekreftelseEl = document.getElementById('bekreftelse');

let bearbeidetBildeBlob = null;

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
    settFeil('kategori', '');
  });
});

/* ========================
   PRIS / GJENTAS — vis/skjul avhengige felt
   ======================== */

document.querySelectorAll('input[name="prisType"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    const valgt = document.querySelector('input[name="prisType"]:checked')?.value;
    prisKrInput.hidden = valgt !== 'kr';
    settFeil('prisType', '');
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
  settFeil('bilde', '');

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
    settFeil('bilde', 'Kunne ikke lese dette bildet. Prøv et annet (JPEG/PNG/WebP).');
  }
});

bildeLenkeInput.addEventListener('input', () => {
  if (bearbeidetBildeBlob) return; // opplastet fil har forrang på forhåndsvisningen
  const url = bildeLenkeInput.value.trim();
  settFeil('bildeLenke', '');
  if (!url) { skjulBildeForhandsvisning(); return; }

  const probe = new Image();
  probe.onload  = () => visBildeForhandsvisning(url);
  probe.onerror = () => { /* valideres og vises som feil ved innsending */ };
  probe.src = url;
});

/* ========================
   FEILVISNING
   ======================== */

function settFeil(felt, melding) {
  const el = document.querySelector(`[data-feil-for="${felt}"]`);
  if (el) el.textContent = melding ?? '';
}

function fjernAlleFeil() {
  document.querySelectorAll('.send-inn-feil').forEach((el) => { el.textContent = ''; });
}

function visFeil(feilObjekt) {
  let førsteFelt = null;
  Object.entries(feilObjekt).forEach(([felt, melding]) => {
    settFeil(felt, melding);
    if (!førsteFelt) førsteFelt = felt;
  });
  if (førsteFelt) {
    document.querySelector(`[data-feil-for="${førsteFelt}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

/* ========================
   KLIENT-VALIDERING (kun rask tilbakemelding — serveren er autoritativ)
   ======================== */

function validerKlient() {
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

  const kommentar = felt('kommentar');
  if (kommentar.length > MAKS_KOMMENTAR) feil.kommentar = `Maks ${MAKS_KOMMENTAR} tegn.`;

  if (!felt('navn')) feil.navn = 'Navn er påkrevd.';
  if (!felt('kontakt')) feil.kontakt = 'Oppgi e-post eller Instagram-brukernavn.';
  if (!document.getElementById('bekreft').checked) feil.bekreft = 'Du må bekrefte at informasjonen stemmer.';

  return feil;
}

function felt(id) {
  return document.getElementById(id).value.trim();
}

/* ========================
   INNSENDING
   ======================== */

function byggFormData() {
  const fd = new FormData();
  fd.append('nettside', document.getElementById('nettside').value);
  fd.append('kategori', kategoriInput.value);
  fd.append('tittel', felt('tittel'));
  fd.append('sted', felt('sted'));
  fd.append('adresse', felt('adresse'));
  fd.append('dato', document.getElementById('dato').value);
  fd.append('startTid', document.getElementById('start-tid').value);
  fd.append('sluttTid', document.getElementById('slutt-tid').value);
  fd.append('gjentasType', gjentasType.value);
  fd.append('gjentasDag', gjentasDag.value);
  fd.append('prisType', document.querySelector('input[name="prisType"]:checked')?.value ?? '');
  fd.append('prisKr', document.getElementById('pris-kr').value);
  fd.append('prisTekst', felt('pris-tekst'));
  fd.append('beskrivelse', felt('beskrivelse'));
  fd.append('lenke', felt('lenke'));
  fd.append('bildeLenke', felt('bilde-lenke'));
  fd.append('kommentar', felt('kommentar'));
  fd.append('navn', felt('navn'));
  fd.append('organisasjon', felt('organisasjon'));
  fd.append('kontakt', felt('kontakt'));
  fd.append('bekreft', document.getElementById('bekreft').checked ? 'true' : 'false');
  if (bearbeidetBildeBlob) fd.append('bilde', bearbeidetBildeBlob, 'bilde.jpg');
  return fd;
}

function visBekreftelse() {
  skjema.hidden = true;
  bekreftelseEl.hidden = false;
}

function tilbakestillSkjema() {
  skjema.reset();
  fjernAlleFeil();
  bearbeidetBildeBlob = null;
  skjulBildeForhandsvisning();
  kategoriKnapper.forEach((b) => {
    b.classList.remove('aktiv');
    b.setAttribute('aria-pressed', 'false');
  });
  kategoriInput.value = '';
  delete skjema.dataset.kategori;
  gjentasDag.hidden = true;
  prisKrInput.hidden = true;
  document.getElementById('beskrivelse-teller').textContent = '0';
  document.getElementById('kommentar-teller').textContent = '0';
}

skjema.addEventListener('submit', async (e) => {
  e.preventDefault();
  fjernAlleFeil();

  const feil = validerKlient();
  if (Object.keys(feil).length > 0) {
    visFeil(feil);
    return;
  }

  sendKnapp.disabled = true;
  const opprinneligTekst = sendKnapp.textContent;
  sendKnapp.textContent = 'Sender inn …';

  try {
    const res  = await fetch(`${API_BASE_URL}/api/innsendinger`, {
      method: 'POST',
      body: byggFormData(),
    });
    const data = await res.json().catch(() => ({}));

    if (res.ok && data.ok) {
      trackEvent('event_innsendt', { kategori: kategoriInput.value });
      visBekreftelse();
    } else if (data.feil && typeof data.feil === 'object') {
      visFeil(data.feil);
    } else {
      settFeil('generelt', data.message || 'Noe gikk galt. Prøv igjen.');
    }
  } catch {
    settFeil('generelt', 'Kunne ikke sende inn — sjekk nettforbindelsen og prøv igjen.');
  } finally {
    sendKnapp.disabled = false;
    sendKnapp.textContent = opprinneligTekst;
  }
});

document.getElementById('send-enda-en-knapp').addEventListener('click', () => {
  tilbakestillSkjema();
  bekreftelseEl.hidden = true;
  skjema.hidden = false;
});
