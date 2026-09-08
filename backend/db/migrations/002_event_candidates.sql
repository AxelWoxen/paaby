CREATE TABLE event_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Samme stabile id som candidate-eventet bruker i collector/review.
  legacy_id TEXT NOT NULL UNIQUE,

  -- Hele normaliserte candidate-objektet lagres her.
  -- Det gjør at vi beholder alle feltene collector/review allerede forventer.
  payload JSONB NOT NULL,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),

  -- Kobling til publisert event etter godkjenning.
  published_event_id UUID REFERENCES events(id)
    ON DELETE SET NULL,

  reviewed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE INDEX idx_event_candidates_status
  ON event_candidates(status);

CREATE INDEX idx_event_candidates_created_at
  ON event_candidates(created_at);


CREATE TRIGGER set_event_candidates_updated_at
BEFORE UPDATE ON event_candidates
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();