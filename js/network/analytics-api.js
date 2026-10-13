/* analytics-api.js — fetch-laget mot vårt eget first-party analytics-API.
   Samme API_BASE_URL-mønster som events-api.js. ALDRI await-et av UI-kode —
   alle funksjoner svelger egne feil og returnerer ingenting kallere trenger
   å bry seg om. Er backend nede, skal Påby fungere 100 % normalt likevel
   (se oppgavens DEL 3). */

const API_BASE_URL =
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : 'https://api.paaby.no';

async function post(path, body) {
  try {
    await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    });
  } catch {
    /* Nettverksfeil skal aldri nå UI — se filhodet */
  }
}

export function sendSesjon({ visitorId, sessionId, platform = 'web', utmSource, utmMedium, utmCampaign, referrerHost }) {
  post('/api/analytics/session', {
    visitor_id: visitorId,
    session_id: sessionId,
    platform,
    utm_source: utmSource,
    utm_medium: utmMedium,
    utm_campaign: utmCampaign,
    referrer_host: referrerHost,
  });
}

export function sendHendelse({ visitorId, sessionId, eventName, eventId, category, properties }) {
  post('/api/analytics/event', {
    visitor_id: visitorId,
    session_id: sessionId,
    event_name: eventName,
    event_id: eventId ?? null,
    category: category ?? null,
    properties: properties ?? {},
  });
}

export function sendLagredeSync({ visitorId, eventIds }) {
  post('/api/analytics/saved/sync', {
    visitor_id: visitorId,
    event_ids: eventIds,
  });
}
