/* events-api.js — datahentingslaget.
   Importerer fra data/events.js og kjører validering.
   Grensesnittet: hentEventer() returnerer et Promise med gyldige arrangementer. */

import { EVENTER }         from '../../data/events.js';
import { validerEventer }  from '../application/validering.js';

/**
 * Returnerer alle gyldige arrangementer fra data/events.js.
 * Ugyldige arrangementer logges og hoppes over — appen krasjer ikke.
 *
 * @returns {Promise<Array>}
 */
export function hentEventer() {
  return Promise.resolve(validerEventer(EVENTER));
}
