/* posisjon.js — geografisk logikk.
   Eneste ansvar: hente brukerens GPS-posisjon og regne ut avstand.
   Ingen DOM, ingen fetch, ingen import av andre moduler. */

/**
 * Ber nettleseren om brukerens posisjon via Geolocation API.
 * Returnerer et Promise som løser seg med { lat, lng } hvis OK,
 * eller null hvis brukeren avslår eller nettleseren ikke støtter det.
 *
 * Vi bruker null i stedet for å kaste feil fordi avslått posisjon
 * ikke er en feil — appen skal bare fungere uten avstand.
 */
export function hentPosisjon() {
  return new Promise((resolve) => {
    /* Sjekk at API-et finnes (gamle nettlesere og HTTP-sider mangler det) */
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      /* Suksess: pakk ut lat/lng fra det komplekse GeolocationPosition-objektet */
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),

      /* Feil (avslått, timeout osv.): returner null i stedet for å krasje */
      () => resolve(null)
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
 * @param {Object} fra - { lat, lng }
 * @param {Object} til - { lat, lng }
 * @returns {number} Avstand i km
 */
export function kalkulerAvstand(fra, til) {
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

/* Hjelpefunksjon: konverterer grader til radianer */
function tilRadianer(grader) {
  return grader * (Math.PI / 180);
}
