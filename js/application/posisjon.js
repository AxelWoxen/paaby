/* posisjon.js — geografisk logikk.
   Eneste ansvar: hente brukerens GPS-posisjon og regne ut avstand.
   Ingen DOM, ingen fetch, ingen import av andre moduler. */

/* Kodene GeolocationPositionError bruker — kun til lesbar konsoll-logging. */
const POSISJONSFEIL_NAVN = {
  1: 'PERMISSION_DENIED',
  2: 'POSITION_UNAVAILABLE',
  3: 'TIMEOUT',
};

/**
 * Ber nettleseren om brukerens posisjon via Geolocation API.
 * Returnerer et Promise som løser seg med { lat, lng } hvis OK,
 * eller null hvis brukeren avslår eller nettleseren ikke støtter det.
 *
 * Vi bruker null i stedet for å kaste feil fordi avslått posisjon
 * ikke er en feil — appen skal bare fungere uten avstand.
 *
 * VIKTIG: getCurrentPosition() har ELLERS ingen egen timeout (default er
 * uendelig ventetid) — uten `timeout`-opsjonen under kan et hengende
 * posisjonsoppslag (f.eks. treg WiFi-basert lokasjon på desktop) gjøre at
 * verken success- eller error-callback noensinne fyres, og dette Promise-et
 * aldri løser seg. Da låser tilstand.posisjonLastes seg i main.js og alle
 * senere klikk på «Vis avstand» blir helt tause.
 */
export function hentPosisjon() {
  return new Promise((resolve) => {
    /* Sjekk at API-et finnes (gamle nettlesere og HTTP-sider mangler det) */
    if (!navigator.geolocation) {
      console.log('[posisjon] navigator.geolocation finnes ikke i denne nettleseren/konteksten');
      resolve(null);
      return;
    }

    console.log('[posisjon] ber om posisjon via getCurrentPosition() …');

    navigator.geolocation.getCurrentPosition(
      /* Suksess: pakk ut lat/lng fra det komplekse GeolocationPosition-objektet */
      (pos) => {
        console.log('[posisjon] suksess:', pos.coords.latitude, pos.coords.longitude);
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },

      /* Feil (avslått, utilgjengelig, timeout): returner null i stedet for å krasje */
      (feil) => {
        console.log(`[posisjon] feil: ${POSISJONSFEIL_NAVN[feil.code] ?? feil.code} — ${feil.message}`);
        resolve(null);
      },

      /* 10 sek timeout — garanterer at Promise-et alltid løser seg innen rimelig tid */
      { timeout: 10_000 }
    );
  });
}

/**
 * Regner ut luftlinjeavstand i kilometer mellom to GPS-koordinater
 * ved hjelp av Haversine-formelen.
 *
 * Haversine er den klassiske formelen for dette — den tar høyde for
 * at jorda er kuleformet, noe som betyr mye ved lange avstander,
 * og ganske lite i Oslo (men vi bruker den for korrekthetens skyld).
 *
 * Returnerer null hvis ett eller begge koordinatene er ugyldige.
 *
 * @param {Object} fra - { lat, lng }
 * @param {Object} til - { lat, lng }
 * @returns {number|null} Avstand i km, eller null ved ugyldige koordinater
 */
export function kalkulerAvstand(fra, til) {
  if (!erGyldigeKoordinater(fra) || !erGyldigeKoordinater(til)) return null;

  const R = 6371; /* Jordens gjennomsnittsradius i km */

  /* Vi må konvertere grader til radianer for Math.sin/cos */
  const dLat = tilRadianer(til.lat - fra.lat);
  const dLng = tilRadianer(til.lng - fra.lng);

  /* Selve haversine-formelen — matematikken forklares best visuelt,
     men kjernen er: a = sin²(Δlat/2) + cos(lat1)·cos(lat2)·sin²(Δlng/2) */
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(tilRadianer(fra.lat)) *
    Math.cos(tilRadianer(til.lat)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);

  /* atan2 gir vinkelen c, og R * c gir buelengden = avstand på kulen */
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Validerer at et koordinatobjekt har gyldige lat/lng-verdier.
 * lat: -90 til 90, lng: -180 til 180.
 *
 * @param {any} k
 * @returns {boolean}
 */
export function erGyldigeKoordinater(k) {
  return (
    k != null &&
    typeof k.lat === 'number' && isFinite(k.lat) && k.lat >= -90  && k.lat <= 90 &&
    typeof k.lng === 'number' && isFinite(k.lng) && k.lng >= -180 && k.lng <= 180
  );
}

/* Hjelpefunksjon: konverterer grader til radianer */
function tilRadianer(grader) {
  return grader * (Math.PI / 180);
}
