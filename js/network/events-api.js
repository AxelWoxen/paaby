/* events-api.js — datahentingslaget.
   Henter eventer fra Påby API og kjører validering.
   Resten av appen trenger ikke vite hvor dataene kommer fra. */

import { validerEventer } from '../application/validering.js';

  const API_BASE_URL =
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : 'https://api.paaby.no';

const API_URL = `${API_BASE_URL}/api/events`;

export async function hentEventer() {
  const response = await fetch(API_URL);

  if (!response.ok) {
    throw new Error(`Kunne ikke hente eventer: ${response.status}`);
  }

  const data = await response.json();

  return validerEventer(data.events);
}