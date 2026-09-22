-- Anonym "Ris eller ros?"-tilbakemelding (paaby.no/ris-ros/).
-- Bevisst minimal: ingen navn, e-post, IP eller user-agent lagres — kun
-- selve meldingen. Ikke koblet til event_candidates eller noe annet.

CREATE TABLE feedback (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
