-- Bildelesing: agenten leser eventbildet (plakat/flyer) for å fylle inn
-- informasjon kilden ikke oppga (se collector/core/bildeleser.js).
--
-- Hvert kall til bildemodellen koster penger, så et event skal leses
-- HØYST ÉN gang. image_read_at settes atomisk FØR kallet gjøres
-- (UPDATE … WHERE image_read_at IS NULL), slik at heller ikke to kjøringer
-- samtidig kan lese samme event. Feiler kallet, prøves det ikke på nytt.

ALTER TABLE event_candidates
  -- Når bildet ble lest (eller forsøkt lest). NULL = aldri lest.
  ADD COLUMN IF NOT EXISTS image_read_at TIMESTAMPTZ,

  -- Hva modellen fant i bildet, uansett om det ble brukt eller ikke —
  -- { "funn": {…}, "feil": "…" }. For sporing og feilsøking.
  ADD COLUMN IF NOT EXISTS image_read_result JSONB,

  -- Felt i payload som ble fylt inn fra bildet — vises i review, slik at
  -- en person dobbeltsjekker dem før publisering.
  ADD COLUMN IF NOT EXISTS image_filled_fields TEXT[] NOT NULL DEFAULT '{}';
