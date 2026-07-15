/* oslo-tid.js — hjelpefunksjoner for Europe/Oslo-lokal tid.
   Delt av filtre.js, formatering.js og gruppering.js.
   Ingen DOM, ingen fetch, ingen side-effekter. */

/**
 * Returnerer dato- og tidskomponenter for en Date i Europe/Oslo-tidssone.
 * Bruker Intl.DateTimeFormat for korrekt DST-håndtering hele året.
 *
 * @param {Date} dato
 * @returns {{ år, maned, dag, ukedag, time, min }}
 *   ukedag: 0=søndag, 1=mandag … 5=fredag, 6=lørdag
 */
export function osloKomponenter(dato) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone:  'Europe/Oslo',
    year:      'numeric',
    month:     '2-digit',
    day:       '2-digit',
    weekday:   'short',
    hour:      '2-digit',
    minute:    '2-digit',
    hourCycle: 'h23',
  });

  const deler = fmt.formatToParts(dato).reduce((obj, d) => {
    if (d.type !== 'literal') obj[d.type] = d.value;
    return obj;
  }, {});

  const UKEDAG_NR = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  return {
    år:     Number(deler.year),
    maned:  Number(deler.month),
    dag:    Number(deler.day),
    ukedag: UKEDAG_NR[deler.weekday],
    time:   Number(deler.hour),
    min:    Number(deler.minute),
  };
}

/**
 * Lager et Date-objekt (UTC) for et gitt tidspunkt i Europe/Oslo-tidssone.
 * Finner riktig UTC-offset automatisk — håndterer dermed DST korrekt.
 *
 * @param {number} år
 * @param {number} maned  (1–12)
 * @param {number} dag    (1–31)
 * @param {number} time   (0–23)
 * @param {number} min    (0–59)
 * @param {number} sek    (0–59)
 * @returns {Date}
 */
export function lagOsloDato(år, maned, dag, time = 0, min = 0, sek = 0) {
  const pad  = (n) => String(n).padStart(2, '0');
  const base = `${år}-${pad(maned)}-${pad(dag)}T${pad(time)}:${pad(min)}:${pad(sek)}`;

  /* Prøv sommertid (+02:00) og vintertid (+01:00).
     Bruk den offseten som faktisk gir riktig Oslo-time. */
  for (const offset of ['+02:00', '+01:00']) {
    const kandidat = new Date(base + offset);
    if (osloKomponenter(kandidat).time === time % 24) return kandidat;
  }

  return new Date(base + '+01:00'); /* fallback */
}

/**
 * Returnerer YYYY-MM-DD-nøkkel i Oslo-tid (brukes til dag-gruppering).
 * Tar de første 10 tegnene av ISO-strengen — forutsetter at tidspunktet
 * allerede er oppgitt med Oslo-offset (+02:00 / +01:00).
 *
 * @param {string} isoStrengMedOffset
 * @returns {string}  "YYYY-MM-DD"
 */
export function osloDataNokkel(isoStrengMedOffset) {
  return isoStrengMedOffset.slice(0, 10);
}
