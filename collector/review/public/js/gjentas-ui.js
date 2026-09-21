/* gjentas-ui.js — UI-kontroll for gjentakelsesregelen (event.gjentas).
   Speiler formatet js/application/gjentas.js forstår:
     "ukentlig:søndag" / "månedlig:siste-torsdag" / "månedlig:første-søndag"
   Redesigner IKKE recurrence-motoren — kun kontrollen som lar reviewer
   velge blant de mønstrene systemet faktisk støtter. */

export const UKEDAGER = ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag', 'søndag'];

export function parseGjentasKontroll(gjentas) {
  if (!gjentas) return { type: '', dag: 'søndag' };
  if (gjentas.startsWith('ukentlig:'))        return { type: 'ukentlig', dag: gjentas.slice(9) };
  if (gjentas.startsWith('månedlig:siste-'))  return { type: 'månedlig-siste', dag: gjentas.slice(15) };
  if (gjentas.startsWith('månedlig:første-')) return { type: 'månedlig-første', dag: gjentas.slice(16) };
  return { type: '', dag: 'søndag' };
}

export function byggGjentasStreng(type, dag) {
  if (!type) return null;
  if (type === 'ukentlig')        return `ukentlig:${dag}`;
  if (type === 'månedlig-første') return `månedlig:første-${dag}`;
  return `månedlig:siste-${dag}`;
}

/* Lager gjentas-kontroll og returnerer { el, hentVerdi }. */
export function lagGjentasKontroll(gjentas) {
  const { type: initType, dag: initDag } = parseGjentasKontroll(gjentas);

  const rad = document.createElement('div');
  rad.className = 'gjentas-rad';

  const label = document.createElement('span');
  label.className   = 'gjentas-label';
  label.textContent = 'Gjentas';

  const typeSelect = document.createElement('select');
  typeSelect.className = 'admin-select gjentas-select';
  [
    ['', 'Av (engangsevent)'],
    ['ukentlig', 'Hver …'],
    ['månedlig-siste', 'Siste … i måneden'],
    ['månedlig-første', 'Første … i måneden'],
  ].forEach(([val, txt]) => {
    typeSelect.appendChild(new Option(txt, val, false, val === initType));
  });

  const dagSelect = document.createElement('select');
  dagSelect.className     = 'admin-select gjentas-select';
  dagSelect.style.display = initType ? '' : 'none';
  UKEDAGER.forEach((dag) => {
    dagSelect.appendChild(new Option(dag, dag, false, dag === initDag));
  });

  typeSelect.addEventListener('change', () => {
    dagSelect.style.display = typeSelect.value ? '' : 'none';
  });

  rad.appendChild(label);
  rad.appendChild(typeSelect);
  rad.appendChild(dagSelect);

  return {
    el: rad,
    hentVerdi: () => byggGjentasStreng(typeSelect.value, dagSelect.value),
  };
}
