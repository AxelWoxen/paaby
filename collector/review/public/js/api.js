/* api.js — tynt lag rundt de eksisterende review-endepunktene.
   Ingen nye endepunkter, ingen endrede payloads — kun samlet ett sted
   i stedet for spredt utover visningene. Alle funksjoner kaster ikke;
   de returnerer alltid serverens JSON-svar ({ ok, feil, ... }), slik at
   views kan vise feilmeldingen serveren faktisk sendte. */

// Sender-du en session utløper (f.eks. etter innaktivitet), sender serveren
// 401 på ethvert /api/-kall — send brukeren til innlogging i stedet for å
// la resten av appen stå og feile stille.
function håndterUtlogget(status) {
  if (status === 401) location.href = '/login';
}

async function post(url, body) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      // x-paaby-admin: enkel, egendefinert header et fremmed opphav ikke
      // kan sette (server.js sin krevPaabyHeader) — CSRF-forsvar i dybden.
      headers: {
        'X-Paaby-Admin': '1',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    håndterUtlogget(res.status);
    const data = await res.json().catch(() => ({}));
    if (!res.ok && data.feil === undefined) {
      data.feil = `Serverfeil (${res.status})`;
    }
    return data;
  } catch (err) {
    console.error(`Nettverksfeil mot ${url}:`, err);
    return { ok: false, feil: 'Ingen kontakt med serveren. Sjekk at review-serveren kjører.' };
  }
}

async function get(url) {
  const res = await fetch(url);
  håndterUtlogget(res.status);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

export const api = {
  miljo:            () => get('/api/miljo').catch(() => ({ produksjon: false, ukjent: true })),
  meg:              () => get('/api/meg').catch(() => ({ epost: null })),

  hentCandidates:    () => get('/api/candidates'),
  hentPubliserte:    () => get('/api/publiserte'),

  godkjenn:  (id, data)    => post(`/api/godkjenn/${encodeURIComponent(id)}`, data),
  avslaa:    (id)          => post(`/api/avslaa/${encodeURIComponent(id)}`),
  oppdaterKandidat: (id, data) => post(`/api/kandidat/${encodeURIComponent(id)}/oppdater`, data),

  fremhev:      (id) => post(`/api/fremhev/${encodeURIComponent(id)}`),
  deaktiver:    (id) => post(`/api/deaktiver/${encodeURIComponent(id)}`),
  oppdaterGjentas: (id, gjentas) => post(`/api/gjentas/${encodeURIComponent(id)}`, { gjentas }),
  oppdaterPublisert: (id, data) => post(`/api/oppdater/${encodeURIComponent(id)}`, data),

  leggTilManuelt: (data) => post('/api/manuell', data),
};
