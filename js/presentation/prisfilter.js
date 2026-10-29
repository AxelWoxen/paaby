/* prisfilter.js — prisslider med histogram (à la Airbnb).
   To overlappende range-inputs gir et min/maks-intervall. Histogrammet
   over viser hvor mange arrangementer som finnes per prisnivå, og stolpene
   innenfor valgt intervall fremheves.

   Modulen eier kun DOM-en i #pris-filter. Filtreringen skjer i
   application/filtre.js — vi melder bare fra om nytt intervall. */

import { lagHistogram, formaterPrisIntervall,
         SLIDER_STEG, ANTALL_STOLPER }         from '../application/prisfilter.js';

const el = {};
let tak = 500;
let vedEndring = () => {};

/**
 * @param {(intervall: {min:number, maks:number|null}|null, ferdig: boolean) => void} callback
 *   Kalles ved hver endring. intervall === null betyr «alle priser».
 *   ferdig === true når brukeren slipper slideren (eller trykker Gratis) —
 *   brukes til sporing, så vi ikke logger hvert eneste steg i et dra.
 */
export function initPrisFilter(callback) {
  vedEndring = callback;

  el.histogram = document.getElementById('pris-histogram');
  el.min       = document.getElementById('pris-min');
  el.maks      = document.getElementById('pris-maks');
  el.fyll      = document.getElementById('pris-spor-fyll');
  el.verdi     = document.getElementById('pris-verdi');
  el.takTekst  = document.getElementById('pris-tak-tekst');
  el.gratis    = document.getElementById('pris-gratis');

  for (let i = 0; i < ANTALL_STOLPER; i++) {
    const stolpe = document.createElement('span');
    stolpe.className = 'pris-stolpe';
    el.histogram.appendChild(stolpe);
  }

  el.min.addEventListener('input', () => {
    if (Number(el.min.value) > Number(el.maks.value)) el.min.value = el.maks.value;
    endret(false);
  });
  el.maks.addEventListener('input', () => {
    if (Number(el.maks.value) < Number(el.min.value)) el.maks.value = el.min.value;
    endret(false);
  });
  el.min.addEventListener('change',  () => endret(true));
  el.maks.addEventListener('change', () => endret(true));

  el.gratis.addEventListener('click', () => {
    const erGratisNå = Number(el.maks.value) === 0;
    el.min.value  = 0;
    el.maks.value = erGratisNå ? tak : 0;
    endret(true);
  });

  settPrisTak(tak);
}

/** Setter taket på skalaen (beregnet fra alle arrangementer) og nullstiller. */
export function settPrisTak(nyttTak) {
  tak = nyttTak;
  for (const input of [el.min, el.maks]) {
    input.max  = tak;
    input.step = SLIDER_STEG;
  }
  el.takTekst.textContent = `${tak} kr+`;
  nullstillPrisFilter();
}

export function nullstillPrisFilter() {
  el.min.value  = 0;
  el.maks.value = tak;
  tegn();
}

/** Tegner histogrammet på nytt fra arrangementene som matcher de ANDRE filtrene. */
export function oppdaterPrisHistogram(eventer) {
  const antall  = lagHistogram(eventer, tak);
  const høyeste = Math.max(1, ...antall);

  [...el.histogram.children].forEach((stolpe, i) => {
    stolpe.style.height = antall[i] === 0 ? '' : `${Math.max(8, (antall[i] / høyeste) * 100)}%`;
    stolpe.classList.toggle('tom', antall[i] === 0);
  });
  tegn();
}

function hentIntervall() {
  const min  = Number(el.min.value);
  const maks = Number(el.maks.value);
  return { min, maks: maks >= tak ? null : maks };
}

function endret(ferdig) {
  tegn();
  const intervall = hentIntervall();
  const erAlle    = intervall.min === 0 && intervall.maks === null;
  vedEndring(erAlle ? null : intervall, ferdig);
}

function tegn() {
  const intervall = hentIntervall();
  const minPst    = (Number(el.min.value)  / tak) * 100;
  const maksPst   = (Number(el.maks.value) / tak) * 100;

  el.fyll.style.left  = `${minPst}%`;
  el.fyll.style.right = `${100 - maksPst}%`;

  /* Den øverste tommelen må ligge øverst når begge står helt til høyre,
     ellers kan man ikke dra min-tommelen tilbake. */
  el.min.classList.toggle('foran', Number(el.min.value) > tak / 2);

  const bredde = tak / ANTALL_STOLPER;
  [...el.histogram.children].forEach((stolpe, i) => {
    const fra = i * bredde;
    const til = fra + bredde;
    const innenfor = til > intervall.min && (intervall.maks === null || fra <= intervall.maks);
    stolpe.classList.toggle('innenfor', innenfor);
  });

  el.verdi.textContent = formaterPrisIntervall(intervall);
  el.min.setAttribute('aria-valuetext',  `${el.min.value} kr`);
  el.maks.setAttribute('aria-valuetext', intervall.maks === null ? `${tak} kr eller mer` : `${el.maks.value} kr`);

  const erGratis = intervall.maks === 0;
  el.gratis.classList.toggle('aktiv', erGratis);
  el.gratis.setAttribute('aria-pressed', String(erGratis));
}
