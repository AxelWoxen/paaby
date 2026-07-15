/* validering.js — validerer arrangementsobjekter ved lasting.
   Filtrerer bort ugyldige arrangementer og logger én advarsel per problem.
   Ingen DOM, ingen fetch. */

const TILLATTE_KATEGORIER = new Set(['musikk', 'mat', 'klubb']);

/**
 * Filtrerer en liste med arrangementer.
 * Ugyldige hoppes over med én console.warn — appen krasjer ikke.
 *
 * @param {Array} eventer
 * @returns {Array} kun gyldige arrangementer
 */
export function validerEventer(eventer) {
  if (!Array.isArray(eventer)) {
    console.warn('Påby validering: forventet en liste med arrangementer');
    return [];
  }

  const seneIder = new Set();
  const gyldige  = [];

  for (const e of eventer) {
    const feil = validerEnkelt(e, seneIder);
    if (feil) {
      console.warn(`Påby validering: hopper over "${e?.id ?? '(uten id)'}" — ${feil}`);
    } else {
      seneIder.add(e.id);
      gyldige.push(e);
    }
  }

  return gyldige;
}

/* Validerer ett arrangement. Returnerer feilmelding eller null ved OK. */
function validerEnkelt(e, seneIder) {
  if (!e || typeof e !== 'object')          return 'ikke et objekt';
  if (!e.id || typeof e.id !== 'string')    return 'mangler id';
  if (seneIder.has(e.id))                   return 'duplikat id';
  if (!e.tittel)                             return 'mangler tittel';
  if (!TILLATTE_KATEGORIER.has(e.kategori)) return `ugyldig kategori "${e.kategori}"`;

  /* start — påkrevd med eksplisitt tidssone */
  const startFeil = sjekkTidspunkt(e.start, 'start');
  if (startFeil) return startFeil;
  const start = new Date(e.start);

  /* slutt — valgfri, men må være gyldig og etter start */
  if (e.slutt != null) {
    const sluttFeil = sjekkTidspunkt(e.slutt, 'slutt');
    if (sluttFeil) return sluttFeil;
    if (new Date(e.slutt) <= start) return 'slutt er ikke etter start';
  }

  /* pris — null (ukjent) er OK; ellers ikke-negativt tall */
  if (e.pris !== null && e.pris !== undefined) {
    if (typeof e.pris !== 'number' || e.pris < 0) return `ugyldig pris: ${e.pris}`;
  }

  /* koordinater */
  if (e.lat != null && (typeof e.lat !== 'number' || e.lat < -90  || e.lat > 90))  return 'ugyldig lat';
  if (e.lng != null && (typeof e.lng !== 'number' || e.lng < -180 || e.lng > 180)) return 'ugyldig lng';

  /* lenker */
  if (e.lenke          != null && !erGyldigUrl(e.lenke))          return 'ugyldig lenke';
  if (e.sistVerifisert != null && isNaN(new Date(e.sistVerifisert).getTime()))
    return 'ugyldig sistVerifisert';

  return null; /* gyldig */
}

/* Sjekker at et ISO-tidspunkt er gyldig og har eksplisitt tidssone. */
function sjekkTidspunkt(verdi, feltnavn) {
  if (!verdi || typeof verdi !== 'string')   return `${feltnavn} mangler`;
  if (!/Z$|[+-]\d{2}:\d{2}$/.test(verdi))   return `${feltnavn} mangler eksplisitt tidssone`;
  if (isNaN(new Date(verdi).getTime()))      return `${feltnavn} er ugyldig dato`;
  return null;
}

/**
 * Sjekker om en URL er trygg (kun https: eller http:).
 * Eksportert for gjenbruk i presentasjonslaget.
 *
 * @param {string|null|undefined} url
 * @returns {boolean}
 */
export function erGyldigUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}
