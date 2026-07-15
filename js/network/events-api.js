/* events-api.js — datahentingslaget.
   Henter eventer fra data/events.json og kjører validering.
   Bytt fetch-URLen til en Supabase-forespørsel for å koble til database —
   resten av appen trenger ingen endringer. */

import { validerEventer } from '../application/validering.js';

export async function hentEventer() {
  const response = await fetch('./data/events.json');

  if (!response.ok) {
    throw new Error(`Kunne ikke hente eventer: ${response.status}`);
  }

  const eventer = await response.json();
  return validerEventer(eventer);
}
