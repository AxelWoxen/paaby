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
      <div class="confirm-knapperad">
        <button type="button" class="knapp knapp-sekundaer confirm-avbryt">Avbryt</button>
        <button type="button" class="knapp confirm-bekreft"></button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  return overlay;
}

/**
 * @param {{ tittel: string, tekst: string, bekreftTekst?: string, destruktiv?: boolean }} valg
 * @returns {Promise<boolean>}
 */
export function bekreft({ tittel, tekst, bekreftTekst = 'Bekreft', destruktiv = true }) {
  const el = sikreOverlay();
  el.querySelector('.confirm-tittel').textContent = tittel;
  el.querySelector('.confirm-tekst').textContent  = tekst;

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
    function paBekreft() { lukk(true); }
    function paAvbryt()  { lukk(false); }
    function paEscape(e) { if (e.key === 'Escape') lukk(false); }

    bekreftKnapp.addEventListener('click', paBekreft);
    avbrytKnapp.addEventListener('click', paAvbryt);
    document.addEventListener('keydown', paEscape);
    bekreftKnapp.focus();
  });
}
