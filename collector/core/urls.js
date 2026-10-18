// urls.js — enkel, delt URL-normalisering for alle adapters.
//
// En ugyldig VALGFRI URL (billett-lenke, bilde-URL, kilde-URL …) skal aldri
// kunne velte hele eventet — den skal bare bli null. Beholder query params
// uendret (UTM/affiliate-parametre kan være viktige), stripper aldri noe.

import { erGyldigUrl } from '../../js/application/validering.js';

/**
 * @param {string|null|undefined} url
 * @returns {string|null}  trimmet url, eller null hvis tom/ugyldig
 */
export function normaliserUrl(url) {
  if (typeof url !== 'string') return null;
  const trimmet = url.trim();
  if (!trimmet) return null;
  return erGyldigUrl(trimmet) ? trimmet : null;
}
