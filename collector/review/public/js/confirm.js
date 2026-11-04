/* confirm.js — enkel bekreftelsesdialog for handlinger som er vanskelige å
   angre (Avslå, Deaktiver). Bruker IKKE window.confirm() — egen, rolig
   modal som matcher resten av admin-panelet.
   Trivielle/reversible handlinger (featured-toggle, vanlig redigering)
   skal ALDRI bruke denne. */

let overlay = null;

function sikreOverlay() {
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-boks" role="alertdialog" aria-modal="true" aria-labelledby="confirm-tittel">
      <p class="confirm-tittel" id="confirm-tittel"></p>
      <p class="confirm-tekst"></p>
      <div class="confirm-grunner kategori-filtre" role="radiogroup" aria-label="Grunn" hidden></div>
      <div class="confirm-knapperad">
        <button type="button" class="knapp knapp-sekundaer confirm-avbryt">Avbryt</button>
        <button type="button" class="knapp confirm-bekreft"></button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  return overlay;
}

/**
 * @param {{ tittel: string, tekst: string, bekreftTekst?: string, destruktiv?: boolean,
 *           grunner?: { verdi: string, tekst: string }[] }} valg
 *   grunner: valgfri liste med chips (én kan velges). Da resolver dialogen
 *   med valgt verdi (null hvis ingen er valgt) i stedet for true, og med
 *   false ved Avbryt — sjekk derfor `=== false`, ikke `!svar`.
 * @returns {Promise<boolean|string|null>}
 */
export function bekreft({ tittel, tekst, bekreftTekst = 'Bekreft', destruktiv = true, grunner = null }) {
  const el = sikreOverlay();
  el.querySelector('.confirm-tittel').textContent = tittel;
  el.querySelector('.confirm-tekst').textContent  = tekst;

  let valgtGrunn = null;
  const grunnRad = el.querySelector('.confirm-grunner');
  grunnRad.innerHTML = '';
  grunnRad.hidden = !grunner?.length;
  for (const g of grunner ?? []) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'kategori-filter-chip';
    chip.textContent = g.tekst;
    chip.setAttribute('role', 'radio');
    chip.setAttribute('aria-checked', 'false');
    chip.addEventListener('click', () => {
      const varValgt = valgtGrunn === g.verdi;
      valgtGrunn = varValgt ? null : g.verdi;
      for (const c of grunnRad.children) {
        c.classList.remove('aktiv');
        c.setAttribute('aria-checked', 'false');
      }
      if (!varValgt) {
        chip.classList.add('aktiv');
        chip.setAttribute('aria-checked', 'true');
      }
    });
    grunnRad.appendChild(chip);
  }

  const bekreftKnapp = el.querySelector('.confirm-bekreft');
  bekreftKnapp.textContent = bekreftTekst;
  bekreftKnapp.className = `knapp confirm-bekreft ${destruktiv ? 'knapp-destruktiv' : 'knapp-primaer'}`;

  const avbrytKnapp = el.querySelector('.confirm-avbryt');

  el.classList.add('apen');

  return new Promise((resolve) => {
    function lukk(resultat) {
      el.classList.remove('apen');
      bekreftKnapp.removeEventListener('click', paBekreft);
      avbrytKnapp.removeEventListener('click', paAvbryt);
      document.removeEventListener('keydown', paEscape);
      resolve(resultat);
    }
    function paBekreft() { lukk(grunner?.length ? valgtGrunn : true); }
    function paAvbryt()  { lukk(false); }
    function paEscape(e) { if (e.key === 'Escape') lukk(false); }

    bekreftKnapp.addEventListener('click', paBekreft);
    avbrytKnapp.addEventListener('click', paAvbryt);
    document.addEventListener('keydown', paEscape);
    bekreftKnapp.focus();
  });
}
