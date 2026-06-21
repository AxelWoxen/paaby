/* events-api.js — nettverkslaget.
   Eneste ansvar: hente rå data fra JSON-filen og returnere den.
   Ingen logikk, ingen DOM, ingen filtrering her. */

/**
 * Henter alle eventer fra data/events.json.
 * Returnerer et Promise som løser seg med en liste av event-objekter.
 * Kaster en feil hvis nettverket feiler eller JSON-en er ugyldig.
 */
export async function hentEventer() {
  const respons = await fetch('data/events.json');

  /* HTTP-feil (404, 500 osv.) kaster ikke automatisk en exception —
     vi må sjekke manuelt om forespørselen gikk bra */
  if (!respons.ok) {
    throw new Error(`Klarte ikke hente eventer: ${respons.status} ${respons.statusText}`);
  }

  const eventer = await respons.json();
  return eventer;
}
