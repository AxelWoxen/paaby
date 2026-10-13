/* analytics-events.js — delt sannhet for first-party produktanalyse.
   Ingen DOM, ingen fetch, ingen side-effekter. Importeres RÅTT av både
   frontend (js/network/analytics-api.js) og backend
   (backend/services/analyticsService.mjs) — akkurat som
   js/application/tags.js allerede importeres av collector/store/published.js.
   Dette er bevisst: klient og server kan aldri drifte ut av sync om hvilke
   hendelser som er gyldige, eller hvordan en occurrence-ID kobles til sitt
   grunn-event. */

/* Hendelsesnavn som (i tillegg til Umami) sendes til vår egen backend.
   Umami/trackEvent() kan fortsatt sende andre navn — de treffer bare ikke
   first-party-APIet. Listen er bevisst fast, se oppgavens DEL 2/8. */
export const ANALYTICS_EVENT_NAVN = [
  'kort_åpnet',
  'event_lagret',
  'event_fjernet_lagret',
  'mer_info_klikket',
  'event_delt',
  'filter_valgt',
  'uke_neste',
  'avstand_aktivert',
];

const GYLDIGE_EVENT_NAVN = new Set(ANALYTICS_EVENT_NAVN);

export function erGyldigAnalyticsEventNavn(navn) {
  return typeof navn === 'string' && GYLDIGE_EVENT_NAVN.has(navn);
}

/* Gjentakende events får en occurrence-ID på formen "<base-id>__YYYY-MM-DD"
   (se js/application/gjentas.js:lagForekomst). Grunn-ID-er (fra
   collector/normalize.js:lagId) er slugifisert med bindestreker, ALDRI
   dobbel understreking — "__" er derfor en entydig skilletegn reservert
   kun for occurrence-suffikset, og vi stoler ikke blindt på et enkelt
   split('__') uten å også validere datoformatet på høyre side.

   Returnerer alltid en streng: base-ID-en hvis eventId matcher
   occurrence-formatet, ellers eventId uendret (engangsevent). */
export function utledBaseEventId(eventId) {
  if (typeof eventId !== 'string' || eventId.length === 0) return null;

  const match = eventId.match(/^(.+)__(\d{4}-\d{2}-\d{2})$/);
  if (!match) return eventId;

  const [, baseId, dato] = match;
  if (!erGyldigKalenderdato(dato)) return eventId;

  return baseId;
}

function erGyldigKalenderdato(dato) {
  const d = new Date(`${dato}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && dato === d.toISOString().slice(0, 10);
}
