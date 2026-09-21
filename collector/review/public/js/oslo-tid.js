/* oslo-tid.js — Oslo-tidshjelpere for admin-panelet.
   Reviewer kan sitte i en hvilken som helst tidssone (maskinens lokale tid
   brukes IKKE her) — all visning av dato/klokkeslett skal være Europe/Oslo,
   samme regel som selve appen (js/application/oslo-tid.js) bruker.
   Speiler den filen 1:1 — kan ikke importeres direkte siden admin-serveren
   er en frittstående statisk app. */

const OSLO_UKEDAG_NR = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function osloKomponenter(dato) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const deler = fmt.formatToParts(dato).reduce((o, d) => {
    if (d.type !== 'literal') o[d.type] = d.value;
    return o;
  }, {});
  return {
    år: Number(deler.year), maned: Number(deler.month), dag: Number(deler.day),
    ukedag: OSLO_UKEDAG_NR[deler.weekday],
    time: Number(deler.hour), min: Number(deler.minute),
  };
}

/* Lager et Date (UTC) for et gitt tidspunkt i Oslo-tid — prøver sommer- og
   vintertid-offset og velger det som faktisk gir riktig Oslo-klokkeslett. */
export function lagOsloDato(år, maned, dag, time = 0, min = 0, sek = 0) {
  const p    = (n) => String(n).padStart(2, '0');
  const base = `${år}-${p(maned)}-${p(dag)}T${p(time)}:${p(min)}:${p(sek)}`;
  for (const offset of ['+02:00', '+01:00']) {
    const kandidat = new Date(base + offset);
    if (osloKomponenter(kandidat).time === time % 24) return kandidat;
  }
  return new Date(base + '+01:00');
}

const NATT_TERSKEL_TIME       = 20;
const NATTMARGIN_TIMER_SENT   = 3;
const NATTMARGIN_TIMER_TIDLIG = 0;

export function dagensSlutt(startISO) {
  const k = osloKomponenter(new Date(startISO));
  const midnattStart = lagOsloDato(k.år, k.maned, k.dag, 0, 0, 0);
  const nattmargin = k.time >= NATT_TERSKEL_TIME ? NATTMARGIN_TIMER_SENT : NATTMARGIN_TIMER_TIDLIG;
  return new Date(midnattStart.getTime() + (24 + nattmargin) * 60 * 60 * 1000);
}

export function eventTilstand(startISO, nå = new Date()) {
  const start = new Date(startISO);
  if (isNaN(start.getTime())) return 'ferdig';
  if (nå < start) return 'kommende';
  if (nå < dagensSlutt(startISO)) return 'utgatt-i-dag';
  return 'ferdig';
}

export function erPassert(event) {
  if (!event.start) return false;
  return new Date(event.start) < new Date();
}

/* <input type="datetime-local"> ↔ ISO-streng med korrekt Oslo-offset
   (sommer-/vintertid slått opp faktisk, ikke antatt). */
export function osloISOTilDatetimeLocal(iso) {
  if (!iso) return '';
  const k = osloKomponenter(new Date(iso));
  const p = (n) => String(n).padStart(2, '0');
  return `${k.år}-${p(k.maned)}-${p(k.dag)}T${p(k.time)}:${p(k.min)}`;
}

export function datetimeLocalTilOsloISO(local) {
  if (!local) return null;
  const [datoDel, tidDel] = local.split('T');
  const [år, maned, dag]  = datoDel.split('-').map(Number);
  const [time, min]       = (tidDel ?? '00:00').split(':').map(Number);
  const dato = lagOsloDato(år, maned, dag, time, min, 0);

  const k        = osloKomponenter(dato);
  const p        = (n) => String(n).padStart(2, '0');
  const lokalISO = `${k.år}-${p(k.maned)}-${p(k.dag)}T${p(k.time)}:${p(k.min)}:00`;
  const diff     = new Date(lokalISO + 'Z') - dato;
  const timer    = Math.round(diff / 3_600_000);
  const fortegn  = timer >= 0 ? '+' : '-';
  const offset   = `${fortegn}${String(Math.abs(timer)).padStart(2, '0')}:00`;
  return lokalISO + offset;
}

export function formaterDato(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('nb-NO', {
    timeZone: 'Europe/Oslo',
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });
}

export function formaterPris(pris, prisTekst) {
  if (prisTekst) return prisTekst;
  if (pris === 0) return 'Gratis';
  if (pris != null) return `${pris} kr`;
  return 'Pris ukjent';
}
