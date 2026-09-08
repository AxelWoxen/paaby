/* events-api.js — datahentingslaget.
   Henter eventer fra Påby API og kjører validering.
   Resten av appen trenger ikke vite hvor dataene kommer fra. */

import { validerEventer } from '../application/validering.js';

const API_URL = 'http://localhost:3000/api/events';

export async function hentEventer() {
  const response = await fetch(API_URL);

  if (!response.ok) {
    throw new Error(`Kunne ikke hente eventer: ${response.status}`);
  }

  const data = await response.json();

  return validerEventer(data.events);
}