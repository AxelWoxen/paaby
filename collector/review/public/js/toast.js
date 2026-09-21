/* toast.js — enkel, ikke-blokkerende tilbakemelding.
   Erstatter alert() og den gamle "kjør denne git-kommandoen"-boksen
   (som viste udefinerte verdier — serveren har aldri sendt en
   git-kommando siden lagring flyttet til Postgres). */

let container = null;

function sikreContainer() {
  if (container) return container;
  container = document.createElement('div');
  container.className = 'toast-stabel';
  container.setAttribute('role', 'status');
  container.setAttribute('aria-live', 'polite');
  document.body.appendChild(container);
  return container;
}

export function visToast(tekst, type = 'ok') {
  const stabel = sikreContainer();

  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = tekst;
  stabel.appendChild(el);

  requestAnimationFrame(() => el.classList.add('synlig'));

  setTimeout(() => {
    el.classList.remove('synlig');
    setTimeout(() => el.remove(), 250);
  }, 3400);
}

export const visSuksess = (tekst) => visToast(tekst, 'ok');
export const visFeil    = (tekst) => visToast(tekst, 'feil');
