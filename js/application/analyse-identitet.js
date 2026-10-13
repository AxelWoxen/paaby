/* analyse-identitet.js — pseudonym visitor/session-identitet for first-party
   produktanalyse (Innsikt).

   VIKTIG: denne modulen sjekker IKKE samtykke selv — den stoler på at kalleren
   (js/main.js, inni initSamtykke()) kun kaller lagringsfunksjonene under NÅR
   brukeren faktisk har samtykket. Ingen visitor-/session-ID skal opprettes
   eller sendes før det.

   Lagringstilgang er injisert (storage-parameter, default window.localStorage)
   slik at de rene reglene (session-timeout, UTM/referrer-parsing) er
   testbare uten noen DOM/localStorage-shim — se
   collector/review/tests/analyse-identitet.test.mjs. */

const VISITOR_NOKKEL = 'paaby-analyse-id';
const SESJON_NOKKEL = 'paaby-analyse-sesjon';

/* En session varer til ~30 min uten aktivitet (se oppgavens DEL 3). */
export const SESJON_TIMEOUT_MS = 30 * 60 * 1000;


/* ========================
   RENE REGLER (ingen storage, ingen DOM)
   ======================== */

export function erSesjonUtlopt(sisteAktivitetMs, naaMs = Date.now()) {
  if (typeof sisteAktivitetMs !== 'number' || Number.isNaN(sisteAktivitetMs)) return true;
  return naaMs - sisteAktivitetMs > SESJON_TIMEOUT_MS;
}

/**
 * Utleder UTM-felter + referrer-vert fra rå URL-søkestreng og referrer.
 * Lagrer ALDRI hele referrer-URL-er (kun vert, se oppgavens DEL 1H/2) og
 * regner en referrer fra eget domene som "direkte" (internnavigasjon er
 * ikke en trafikkilde).
 *
 * @param {string} sokeStreng   — f.eks. "?utm_source=instagram&utm_medium=bio"
 * @param {string} referrer     — document.referrer, kan være tom streng
 * @param {string} eggetVertsnavn — window.location.hostname
 */
export function utledSesjonKontekst(sokeStreng, referrer, eggetVertsnavn) {
  const params = new URLSearchParams(sokeStreng || '');

  const utmSource = params.get('utm_source')?.trim() || null;
  const utmMedium = params.get('utm_medium')?.trim() || null;
  const utmCampaign = params.get('utm_campaign')?.trim() || null;

  let referrerHost = null;
  if (referrer) {
    try {
      const vert = new URL(referrer).hostname;
      if (vert && vert !== eggetVertsnavn) referrerHost = vert;
    } catch {
      /* ugyldig referrer-URL — ignorer */
    }
  }

  return { utmSource, utmMedium, utmCampaign, referrerHost };
}


/* ========================
   LAGRING (localStorage)
   ======================== */

function lesJson(storage, nokkel) {
  try {
    const rå = storage.getItem(nokkel);
    return rå ? JSON.parse(rå) : null;
  } catch {
    return null;
  }
}

function skrivJson(storage, nokkel, verdi) {
  try {
    storage.setItem(nokkel, JSON.stringify(verdi));
  } catch {
    /* localStorage utilgjengelig (f.eks. privat modus) — analytics er valgfritt */
  }
}

/**
 * Henter eksisterende visitor-ID, eller lager og lagrer en ny.
 * Kalleren MÅ allerede ha bekreftet samtykke.
 */
export function hentEllerLagVisitorId(storage = window.localStorage) {
  const eksisterende = storage.getItem(VISITOR_NOKKEL);
  if (eksisterende) return eksisterende;

  const ny = crypto.randomUUID();
  try {
    storage.setItem(VISITOR_NOKKEL, ny);
  } catch {
    /* se skrivJson over */
  }
  return ny;
}

/**
 * Henter aktiv session (gjenbrukes på tvers av faner via localStorage) eller
 * starter en ny hvis ingen finnes eller den forrige er utløpt (>30 min
 * inaktivitet). Oppdaterer alltid sisteAktivitet.
 *
 * @returns {{ sessionId: string, erNy: boolean }}
 */
export function hentEllerLagSesjon(storage = window.localStorage, naa = Date.now()) {
  const lagret = lesJson(storage, SESJON_NOKKEL);

  if (lagret?.sessionId && !erSesjonUtlopt(lagret.sisteAktivitet, naa)) {
    skrivJson(storage, SESJON_NOKKEL, { sessionId: lagret.sessionId, sisteAktivitet: naa });
    return { sessionId: lagret.sessionId, erNy: false };
  }

  const sessionId = crypto.randomUUID();
  skrivJson(storage, SESJON_NOKKEL, { sessionId, sisteAktivitet: naa });
  return { sessionId, erNy: true };
}
