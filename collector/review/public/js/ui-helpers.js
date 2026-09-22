/* ui-helpers.js — gjenbrukte skjema-byggeklosser for redigering/opprettelse
   av events (kategori-velger, tekstfelt, bilde-beskjæring). Brukes av
   Til vurdering-, Innsendte- og Publiserte-visningene, som alle redigerer
   samme feltsett mot samme payload-form. */

import { osloISOTilDatetimeLocal } from './oslo-tid.js';

export const KATEGORIER = [
  ['musikk', 'Musikk'],
  ['klubb', 'Klubb'],
  ['pafunn', 'Påfunn'],
];

export function lagKategoriVelgerEl(aktivKat) {
  const rad = document.createElement('div');
  rad.className = 'kategori-velger';
  let valgt = aktivKat;
  const knapper = [];
  KATEGORIER.forEach(([val, txt]) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `chip kategori-chip${val === aktivKat ? ' aktiv' : ''}`;
    btn.dataset.verdi = val;
    btn.textContent = txt;
    btn.onclick = () => {
      valgt = val;
      knapper.forEach((k) => k.classList.remove('aktiv'));
      btn.classList.add('aktiv');
    };
    knapper.push(btn);
    rad.appendChild(btn);
  });
  return { el: rad, hentVerdi: () => valgt };
}

export function lagFelt(label, verdi, type = 'text', { pakrevd = false, plassholder = '' } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'felt-gruppe';
  const lab = document.createElement('label');
  lab.className = 'felt-label';
  lab.textContent = pakrevd ? `${label} *` : label;
  const input = document.createElement('input');
  input.type = type;
  input.value = verdi ?? '';
  input.className = 'admin-input';
  if (plassholder) input.placeholder = plassholder;
  wrap.appendChild(lab);
  wrap.appendChild(input);
  return { wrap, input };
}

export function lagFeltRad(...felt) {
  const rad = document.createElement('div');
  rad.className = 'felt-rad';
  felt.forEach((f) => rad.appendChild(f.wrap));
  return rad;
}

export function lagTekstomrade(label, verdi, rows = 3, plassholder = '') {
  const wrap = document.createElement('div');
  wrap.className = 'felt-gruppe';
  const lab = document.createElement('label');
  lab.className = 'felt-label';
  lab.textContent = label;
  const ta = document.createElement('textarea');
  ta.className = 'admin-textarea';
  ta.rows = rows;
  ta.value = verdi ?? '';
  if (plassholder) ta.placeholder = plassholder;
  wrap.appendChild(lab);
  wrap.appendChild(ta);
  return { wrap, lab, ta };
}

/* ─── Bilde-crop ────────────────────────────────────────────────────────────
   Cropper.js (CDN) lar deg beskjære bilde-URL-en til 16:7 — samme forhold
   som kortet i selve appen bruker — før lagring. Beskjæringen skjer
   client-side (canvas) og resultatet lagres som en data-URL rett i
   fBilde sitt input-felt (sendes uendret videre til de eksisterende
   oppdater-endepunktene), så ingen ny server-rute trengs.
   Rører IKKE bilde-URL-feltet med mindre man aktivt trykker
   «Bruk dette utsnittet». */
const CROP_BREDDE = 1200;
const CROP_HOYDE  = Math.round(CROP_BREDDE * 7 / 16); // 525 — 16:7

export function lagBildeCropSeksjon(fBilde) {
  const seksjon = document.createElement('div');
  seksjon.className = 'crop-seksjon';

  const label = document.createElement('label');
  label.className = 'felt-label';
  label.textContent = 'Beskjær bilde (16:7 — samme forhold som kortet i appen)';

  const tomMelding = document.createElement('div');
  tomMelding.className = 'crop-tom';
  tomMelding.textContent = 'Lim inn en bilde-URL over for å beskjære.';

  const imgWrap = document.createElement('div');
  imgWrap.className = 'crop-img-wrap';
  imgWrap.style.display = 'none';
  const cropImg = document.createElement('img');
  cropImg.className = 'crop-img';
  cropImg.alt = '';
  imgWrap.appendChild(cropImg);

  const knapperad = document.createElement('div');
  knapperad.className = 'crop-knapperad';
  knapperad.style.display = 'none';
  const brukKnapp = document.createElement('button');
  brukKnapp.type = 'button';
  brukKnapp.className = 'knapp knapp-sekundaer crop-bruk-knapp';
  brukKnapp.textContent = 'Bruk dette utsnittet';
  knapperad.appendChild(brukKnapp);

  const status = document.createElement('div');
  status.className = 'crop-status';

  const fvRad = document.createElement('div');
  fvRad.className = 'crop-forhandsvisning-rad';
  fvRad.style.display = 'none';
  const fvLabel = document.createElement('label');
  fvLabel.className = 'felt-label';
  fvLabel.textContent = 'Forhåndsvisning (som på kortet i appen)';
  const fvWrap = document.createElement('div');
  fvWrap.className = 'crop-forhandsvisning-wrap';
  const fvImg = document.createElement('img');
  fvImg.className = 'crop-forhandsvisning-img';
  fvImg.alt = '';
  fvWrap.appendChild(fvImg);
  fvRad.appendChild(fvLabel);
  fvRad.appendChild(fvWrap);

  seksjon.appendChild(label);
  seksjon.appendChild(tomMelding);
  seksjon.appendChild(imgWrap);
  seksjon.appendChild(knapperad);
  seksjon.appendChild(status);
  seksjon.appendChild(fvRad);

  let cropper   = null;
  let lastetUrl = null;

  function settStatus(klasse, tekst) {
    status.className = klasse ? `crop-status ${klasse}` : 'crop-status';
    status.textContent = tekst ?? '';
  }

  // Kortet over (thumbnailen i selve kort-visningen) laster ofte samme URL
  // som en vanlig <img> UTEN crossorigin — det kan "forgifte" nettleserens
  // bilde-cache slik at et senere crossOrigin="anonymous"-forsøk på nøyaktig
  // samme URL stille gjenbruker den ikke-CORS-taggede cache-oppføringen (og
  // dermed likevel feiler på toDataURL). Cache-buster tvinger et friskt,
  // riktig CORS-taggede nettverkskall for selve crop-verktøyet.
  function cacheBust(url) {
    if (url.startsWith('data:')) return url;
    const skille = url.includes('?') ? '&' : '?';
    return `${url}${skille}_paabycrop=${Date.now()}`;
  }

  function initCropper(url, kanEksporteres, lastetSrc) {
    if (lastetUrl !== url) return; // en nyere URL har overtatt i mellomtiden
    cropImg.crossOrigin = kanEksporteres ? 'anonymous' : '';
    cropImg.src = lastetSrc;
    imgWrap.style.display = '';
    knapperad.style.display = '';

    if (cropper) { cropper.destroy(); cropper = null; }
    cropper = new Cropper(cropImg, {
      aspectRatio: 16 / 7,
      viewMode: 1,
      autoCropArea: 1,
      background: false,
      responsive: true,
    });

    if (!kanEksporteres) {
      settStatus('feil', 'Dette bildet tillater trolig ikke lokal beskjæring (CORS). Du kan fortsatt trykke «Bruk dette utsnittet», men lykkes det ikke beholdes original-URL-en uendret ved lagring.');
    }
  }

  function lastBilde(url) {
    if (cropper) { cropper.destroy(); cropper = null; }
    settStatus(null, '');
    fvRad.style.display = 'none';
    lastetUrl = url;

    if (!url) {
      imgWrap.style.display = 'none';
      knapperad.style.display = 'none';
      tomMelding.style.display = '';
      return;
    }
    tomMelding.style.display = 'none';

    const bustet = cacheBust(url);
    const probe = new Image();
    probe.crossOrigin = 'anonymous';
    probe.onload  = () => initCropper(url, true, bustet);
    probe.onerror = () => initCropper(url, false, url);
    probe.src = bustet;
  }

  brukKnapp.onclick = () => {
    if (!cropper) return;
    try {
      const canvas = cropper.getCroppedCanvas({
        width: CROP_BREDDE,
        height: CROP_HOYDE,
        imageSmoothingQuality: 'high',
        fillColor: '#FFFCF7',
      });
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      fBilde.input.value = dataUrl;
      fvImg.src = dataUrl;
      fvRad.style.display = '';
      settStatus('ok', 'Utsnitt brukt — lagres som beskåret bilde når du trykker «Lagre endringer».');
    } catch (e) {
      settStatus('feil', 'Kunne ikke beskjære dette bildet lokalt (bildeserveren blokkerer det via CORS). Original-URL-en beholdes uendret ved lagring.');
    }
  };

  let debounceTimer = null;
  fBilde.input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const url = fBilde.input.value.trim();
      if (url !== lastetUrl) lastBilde(url);
    }, 500);
  });

  return {
    el: seksjon,
    lastInnVedVisning: () => {
      const url = fBilde.input.value.trim();
      if (url && url !== lastetUrl) lastBilde(url);
    },
  };
}

/* Fullt redigeringsskjema for ett event (candidate eller publisert) —
   samme feltsett begge steder. Returnerer { el, hentVerdier, bildeCrop }. */
export function lagRedigeringsFelter(event) {
  const katLabel = document.createElement('label');
  katLabel.className = 'felt-label';
  katLabel.textContent = 'Kategori';
  const kat = lagKategoriVelgerEl(event.kategori);

  const fTittel    = lagFelt('Tittel', event.tittel, 'text', { pakrevd: true });
  const fStart     = lagFelt('Start (dato og tid)', osloISOTilDatetimeLocal(event.start), 'datetime-local', { pakrevd: true });
  const fSlutt     = lagFelt('Slutt', osloISOTilDatetimeLocal(event.slutt), 'datetime-local');
  const fSted      = lagFelt('Sted', event.sted);
  const fAdresse   = lagFelt('Adresse', event.adresse);
  const fLat       = lagFelt('Lat', event.lat ?? '');
  const fLng       = lagFelt('Lng', event.lng ?? '');
  const fPris      = lagFelt('Pris (kr, 0 = gratis, tom = ukjent)', event.pris ?? '');
  const fPrisTekst = lagFelt('Prisvisning', event.prisTekst);
  const fLenke     = lagFelt('Lenke (billett / mer info)', event.lenke);
  const fBilde     = lagFelt('Bilde-URL', event.bilde);
  const bildeCrop  = lagBildeCropSeksjon(fBilde);
  const tBesk      = lagTekstomrade('Beskrivelse', event.beskrivelse, 3);
  const tKur       = lagTekstomrade('Kuratortekst (vises i kortet)', event.kuratortekst, 2);

  const el = document.createElement('div');
  el.className = 'rediger-felter';
  el.appendChild(katLabel);
  el.appendChild(kat.el);
  el.appendChild(fTittel.wrap);
  el.appendChild(lagFeltRad(fStart, fSlutt));
  el.appendChild(lagFeltRad(fSted, fAdresse));
  el.appendChild(lagFeltRad(fLat, fLng));
  el.appendChild(lagFeltRad(fPris, fPrisTekst));
  el.appendChild(tBesk.wrap);
  el.appendChild(tKur.wrap);
  el.appendChild(fLenke.wrap);
  el.appendChild(fBilde.wrap);
  el.appendChild(bildeCrop.el);

  function hentVerdier() {
    return {
      tittel: fTittel.input.value.trim(),
      kategori: kat.hentVerdi(),
      sted: fSted.input.value.trim(),
      adresse: fAdresse.input.value.trim(),
      lat: fLat.input.value.trim(),
      lng: fLng.input.value.trim(),
      start: fStart.input.value.trim(),
      slutt: fSlutt.input.value.trim(),
      pris: fPris.input.value.trim(),
      prisTekst: fPrisTekst.input.value.trim(),
      beskrivelse: tBesk.ta.value.trim(),
      kuratortekst: tKur.ta.value.trim(),
      lenke: fLenke.input.value.trim(),
      bilde: fBilde.input.value.trim(),
    };
  }

  return { el, hentVerdier, bildeCrop, felter: { fTittel, fStart, tKur } };
}
