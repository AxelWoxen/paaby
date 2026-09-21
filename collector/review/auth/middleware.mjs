// middleware.mjs — håndhever innlogging server-side for HELE adminpanelet.
//
// Blokkerer both statiske filer (HTML/JS/CSS) og /api/*-endepunkter for
// alle som ikke har en gyldig, innlogget session. Frontend-skjuling er
// ALDRI autentisering — dette er den eneste reelle sperren.

const ÅPNE_STIER = new Set(['/login', '/logout']);

export function krevInnlogging(req, res, next) {
  if (ÅPNE_STIER.has(req.path)) return next();
  if (req.session?.brukerId) return next();

  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ feil: 'Ikke innlogget' });
  }
  return res.redirect('/login');
}

// Lett CSRF-forsvar for alle tilstandsendrende (ikke-GET) kall mot /api/*:
// krever en egendefinert header som en vanlig <form>-CSRF eller et fetch-kall
// fra et fremmed opphav ikke kan sette (ville i tillegg blitt blokkert av
// CORS/preflight før det når hit, siden serveren ikke sender noen
// Access-Control-Allow-Origin for andre opphav). Kombinert med
// SameSite=Lax-cookien (se server.js) — cookien følger uansett ikke med på
// cross-site POST/fetch — er dette forsvar i dybden, ikke eneste sperre.
export function krevPaabyHeader(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  if (ÅPNE_STIER.has(req.path)) return next();

  if (req.get('x-paaby-admin') !== '1') {
    return res.status(403).json({ feil: 'Ugyldig forespørsel' });
  }
  return next();
}
