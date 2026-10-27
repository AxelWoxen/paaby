// index.js — adapter-registry. run.js skal bare vite at det finnes en
// funksjon per source.adapter-verdi — ikke hvordan hver kilde faktisk
// fungerer. Legg til en ny kilde ved å importere adapteren og legge den
// til i ADAPTERS under.

import { hentBroadcastEvents } from './broadcast-events.js';
import { hentTicketmasterEvents } from './ticketmaster.js';
import { hentTikkioEvents } from './tikkio.js';
import { hentBillettoEvents } from './billetto.js';
import { hentTicksterEvents } from './tickster.js';

export const ADAPTERS = {
  'broadcast-events': hentBroadcastEvents,
  'ticketmaster': hentTicketmasterEvents,
  'tikkio': hentTikkioEvents,
  'billetto': hentBillettoEvents,
  'tickster': hentTicksterEvents,
};

/**
 * Henter rå-events (i felles external-event-form, se core/sync.js) for én
 * kilde, via riktig adapter.
 *
 * @param {Object} source  ett objekt fra config/sources.js
 * @returns {Promise<Object[]>}
 */
export async function hentFraKilde(source) {
  const adapter = ADAPTERS[source.adapter];
  if (!adapter) throw new Error(`Ukjent adapter: "${source.adapter}"`);
  return adapter(source);
}
