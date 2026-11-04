/* periode-kalender.js — periodevelger i flyselskap-stil: klikk én dag for
   start, en annen for slutt, og alt imellom markeres. Brukes av
   liste-kontroller.js for «Velg datoer…» i adminlistene.

   Datoer håndteres som 'YYYY-MM-DD'-strenger (kalenderdager, ikke
   tidspunkt) — de sammenlignes leksikografisk, og omregning til Oslo-tid
   skjer først i filteret. All datoaritmetikk går via Date.UTC slik at
   reviewerens lokale tidssone ikke spiller inn. */

import { osloKomponenter } from './oslo-tid.js';

const UKEDAGER = ['ma', 'ti', 'on', 'to', 'fr', 'lø', 'sø'];
const p2 = (n) => String(n).padStart(2, '0');
const tilStreng = (d) => `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
const fraStreng = (s) => {
  const [år, maned, dag] = s.split('-').map(Number);
  return new Date(Date.UTC(år, maned - 1, dag));
};

function iDag() {
  const { år, maned, dag } = osloKomponenter(new Date());
  return `${år}-${p2(maned)}-${p2(dag)}`;
}

const manedFmt = new Intl.DateTimeFormat('nb-NO', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const kortFmt = new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const langFmt = new Intl.DateTimeFormat('nb-NO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export function formaterPeriode(fra, til) {
  if (!fra) return 'Velg datoer';
  if (!til || til === fra) return kortFmt.format(fraStreng(fra));
  return `${kortFmt.format(fraStreng(fra))} – ${kortFmt.format(fraStreng(til))}`;
}

/* onEndring({ fra, til }) kalles når en periode er valgt eller nullstilt.
   Bare start valgt = én dag (til === fra) til slutten er klikket. */
export function lagPeriodeKalender({ onEndring }) {
  let fra = '';
  let til = '';
  let hover = '';
  // Første synlige måned, som Date på den 1. (UTC).
  let visning = (() => {
    const d = fraStreng(iDag());
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  })();

  const wrap = document.createElement('div');
  wrap.className = 'periode';

  const knapp = document.createElement('button');
  knapp.type = 'button';
  knapp.className = 'admin-select periode-knapp';
  knapp.setAttribute('aria-haspopup', 'dialog');
  knapp.setAttribute('aria-expanded', 'false');

  const popover = document.createElement('div');
  popover.className = 'periode-popover';
  popover.setAttribute('role', 'dialog');
  popover.setAttribute('aria-label', 'Velg periode');
  popover.hidden = true;

  wrap.append(knapp, popover);

  const antallManeder = () => (window.matchMedia('(min-width: 700px)').matches ? 2 : 1);

  function oppdaterKnapp() {
    knapp.textContent = formaterPeriode(fra, til);
    knapp.classList.toggle('har-verdi', Boolean(fra));
  }

  function lagManed(start) {
    const maned = document.createElement('div');
    maned.className = 'periode-maned';

    const tittel = document.createElement('div');
    tittel.className = 'periode-maned-tittel';
    tittel.textContent = manedFmt.format(start);
    maned.appendChild(tittel);

    const grid = document.createElement('div');
    grid.className = 'periode-grid';
    for (const u of UKEDAGER) {
      const h = document.createElement('span');
      h.className = 'periode-ukedag';
      h.textContent = u;
      grid.appendChild(h);
    }

    // Uka starter på mandag.
    const forskyvning = (start.getUTCDay() + 6) % 7;
    for (let i = 0; i < forskyvning; i++) grid.appendChild(document.createElement('span'));

    const år = start.getUTCFullYear();
    const m = start.getUTCMonth();
    const dagerIManed = new Date(Date.UTC(år, m + 1, 0)).getUTCDate();
    for (let dag = 1; dag <= dagerIManed; dag++) {
      const dato = tilStreng(new Date(Date.UTC(år, m, dag)));
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'periode-dag';
      b.dataset.dato = dato;
      b.textContent = String(dag);
      b.setAttribute('aria-label', langFmt.format(fraStreng(dato)));
      grid.appendChild(b);
    }
    maned.appendChild(grid);
    return maned;
  }

  const hint = document.createElement('span');
  hint.className = 'periode-hint';

  function render() {
    popover.innerHTML = '';

    const nav = document.createElement('div');
    nav.className = 'periode-nav';
    const forrige = document.createElement('button');
    forrige.type = 'button';
    forrige.className = 'periode-pil';
    forrige.textContent = '‹';
    forrige.setAttribute('aria-label', 'Forrige måned');
    forrige.addEventListener('click', () => flyttManed(-1));
    const neste = document.createElement('button');
    neste.type = 'button';
    neste.className = 'periode-pil';
    neste.textContent = '›';
    neste.setAttribute('aria-label', 'Neste måned');
    neste.addEventListener('click', () => flyttManed(1));
    nav.append(forrige, neste);

    const maneder = document.createElement('div');
    maneder.className = 'periode-maneder';
    for (let i = 0; i < antallManeder(); i++) {
      maneder.appendChild(lagManed(new Date(Date.UTC(visning.getUTCFullYear(), visning.getUTCMonth() + i, 1))));
    }

    const bunn = document.createElement('div');
    bunn.className = 'periode-bunn';
    const nullstill = document.createElement('button');
    nullstill.type = 'button';
    nullstill.className = 'knapp knapp-sekundaer';
    nullstill.textContent = 'Nullstill';
    nullstill.addEventListener('click', () => {
      fra = '';
      til = '';
      oppdaterAlt();
      onEndring({ fra, til });
    });
    const ferdig = document.createElement('button');
    ferdig.type = 'button';
    ferdig.className = 'knapp knapp-primaer';
    ferdig.textContent = 'Ferdig';
    ferdig.addEventListener('click', () => lukk(true));
    bunn.append(hint, nullstill, ferdig);

    popover.append(nav, maneder, bunn);
    markerDager();
  }

  // Oppdaterer bare klassene — kalt ved hover, så hele kalenderen ikke
  // bygges på nytt for hver musebevegelse.
  function markerDager() {
    const idag = iDag();
    const slutt = til || (fra && hover > fra ? hover : '');
    for (const b of popover.querySelectorAll('.periode-dag')) {
      const d = b.dataset.dato;
      const erStart = d === fra;
      const erSlutt = Boolean(slutt) && d === slutt;
      b.classList.toggle('er-start', erStart);
      b.classList.toggle('er-slutt', erSlutt || (erStart && !slutt));
      b.classList.toggle('i-periode', Boolean(fra && slutt) && d > fra && d < slutt);
      b.classList.toggle('er-forhandsvisning', !til && Boolean(slutt));
      b.classList.toggle('er-i-dag', d === idag);
      b.setAttribute('aria-pressed', String(erStart || erSlutt));
    }
    hint.textContent = !fra || til ? 'Velg startdato' : 'Velg sluttdato';
  }

  function oppdaterAlt() {
    oppdaterKnapp();
    if (!popover.hidden) markerDager();
  }

  function flyttManed(retning) {
    visning = new Date(Date.UTC(visning.getUTCFullYear(), visning.getUTCMonth() + retning, 1));
    render();
  }

  function velgDag(dato) {
    if (!fra || til || dato < fra) {
      // Ny periode (eller ny start før den gamle).
      fra = dato;
      til = '';
      oppdaterAlt();
      onEndring({ fra, til: fra });
      return;
    }
    til = dato;
    hover = '';
    oppdaterAlt();
    onEndring({ fra, til });
    lukk(true);
  }

  function apne() {
    if (fra) {
      const d = fraStreng(fra);
      visning = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    }
    popover.hidden = false;
    knapp.setAttribute('aria-expanded', 'true');
    render();
    document.addEventListener('pointerdown', utenforKlikk);
    document.addEventListener('keydown', escape);
  }

  function lukk(fokuserKnapp = false) {
    if (popover.hidden) return;
    // Lukket midt i et valg: start alene teller som én dag.
    if (fra && !til) {
      til = fra;
      oppdaterKnapp();
    }
    popover.hidden = true;
    hover = '';
    knapp.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', utenforKlikk);
    document.removeEventListener('keydown', escape);
    if (fokuserKnapp) knapp.focus();
  }

  function utenforKlikk(e) {
    if (!wrap.contains(e.target)) lukk();
  }

  function escape(e) {
    if (e.key === 'Escape') lukk(true);
  }

  knapp.addEventListener('click', () => (popover.hidden ? apne() : lukk()));

  popover.addEventListener('click', (e) => {
    const dag = e.target.closest('.periode-dag');
    if (dag) velgDag(dag.dataset.dato);
  });
  popover.addEventListener('pointerover', (e) => {
    const dag = e.target.closest('.periode-dag');
    if (!dag || !fra || til) return;
    hover = dag.dataset.dato;
    markerDager();
  });

  oppdaterKnapp();

  return { el: wrap, apne, lukk };
}
