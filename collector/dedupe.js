// Dropper eventer vi allerede har sett.
//
// Hashing-strategi: sha1 av "tittel|YYYY-MM-DD|sted" (lowercase, trimmet).
// Dato-delen er bare de 10 første tegnene av ISO-strengen, slik at
// Frank Znort Quartet 2026-07-19 ≠ Frank Znort Quartet 2026-07-26.
// Det er korrekt: vi vil vurdere hvert arrangement separat.

import { createHash } from 'crypto';

// Lager en kort, stabil hash av de tre feltene som unikt identifiserer et event
export function lagHash(event) {
  const nøkkel = [
    (event.tittel ?? '').toLowerCase().trim(),
    (event.start  ?? '').slice(0, 10),
    (event.sted   ?? '').toLowerCase().trim(),
  ].join('|');
  return createHash('sha1').update(nøkkel).digest('hex').slice(0, 12);
}

// Returnerer kun de nye eventene fra kandidatlisten —
// de som ikke allerede finnes i eksisterende (candidates + events.json).
export function dedupliser(kandidater, eksisterende) {
  const sett = new Set(eksisterende.map(lagHash));
  return kandidater.filter((e) => !sett.has(lagHash(e)));
}
