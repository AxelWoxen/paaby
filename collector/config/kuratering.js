// ─── Manuelle kurateringsregler for agenten ──────────────────────────────────
//
// Agenten (run.js) lærer selv av godkjent/avslått i review — se
// core/interesse.js. Disse listene er for det du allerede VET og ikke vil
// vente på at den lærer:
//
//   HOLD_UTE  — events som matcher holdes ute av «Fra API» (de lagres
//               fortsatt som candidates, men skjules bak «Vis holdt ute»).
//   ALLTID_MED — vinner over alt annet, også lærte regler. Bruk for steder
//               du alltid vil se, selv etter mange avslag.
//
// steder: stedsnavn slik det står på eventet (sammenlignes som slug, så
//         «Blå», «BLÅ» og «blaa» er det samme).
// ord:    hele ord/fraser i tittelen (store/små bokstaver og æøå spiller
//         ingen rolle). «kurs» treffer «Keramikk-kurs», ikke «Kursiv».

export const HOLD_UTE = {
  steder: [],
  ord: [],
};

export const ALLTID_MED = {
  steder: [],
  ord: [],
};
