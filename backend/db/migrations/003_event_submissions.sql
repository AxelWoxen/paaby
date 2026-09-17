-- Innsendinger fra arrangører ("Send inn ditt event").
-- Innsendinger havner alltid som en pending event_candidates-rad — aldri
-- publisert automatisk. Innsenderdata lagres i egne kolonner (ikke i
-- payload), slik at kontaktinfo aldri kan havne i et publisert event eller
-- i det offentlige API-et (GET /api/events leser aldri event_candidates).

ALTER TABLE event_candidates
  ADD COLUMN source TEXT NOT NULL DEFAULT 'collector'
    CHECK (source IN ('collector', 'manuell', 'innsending')),

  ADD COLUMN submitter_name TEXT,
  ADD COLUMN submitter_org TEXT,
  ADD COLUMN submitter_contact TEXT,
  ADD COLUMN submitter_note TEXT,

  -- Enkel duplikat-heuristikk beregnet ved innsending (samme dag + lignende
  -- tittel/sted). Kun et varsel som vises i review — blokkerer ikke innsending.
  ADD COLUMN possible_duplicate BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN duplicate_hint TEXT;


CREATE TABLE candidate_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  candidate_id UUID NOT NULL REFERENCES event_candidates(id)
    ON DELETE CASCADE,

  mime_type TEXT NOT NULL,
  data BYTEA NOT NULL,
  byte_size INTEGER NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_candidate_images_candidate_id
  ON candidate_images(candidate_id);
