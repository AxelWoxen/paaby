-- Læring og sporing for den automatiske collector-kjøringen ("agenten").
--
-- Mål: hver gang collectoren legger til et event skal vi kunne si
--   1. HVILKEN kjøring som fant det (collector_runs),
--   2. hvor interessant agenten trodde det var da (interest_score/-reasons),
--   3. hvilken informasjon som manglet (missing_fields),
--   4. hva en person faktisk bestemte, og hvorfor (candidate_decisions).
--
-- Selve modellen lagres IKKE — den trenes på nytt fra beslutningene ved
-- hver kjøring (se collector/core/interesse.js). Det gjør den ærlig: det
-- finnes ingen skjult tilstand som kan gli fra det som faktisk står i
-- event_candidates/events.

CREATE TABLE IF NOT EXISTS collector_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,

    horizon_days INTEGER NOT NULL,

    -- Tellere per kilde + totalt, samme navn som run.js skriver ut.
    stats JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Antall beslutninger modellen ble trent på i denne kjøringen.
    training_size INTEGER
);


ALTER TABLE event_candidates
  ADD COLUMN IF NOT EXISTS collector_run_id UUID REFERENCES collector_runs(id)
    ON DELETE SET NULL,

  -- 0–100, null = for lite beslutningsgrunnlag til å si noe ennå.
  ADD COLUMN IF NOT EXISTS interest_score REAL
    CHECK (interest_score IS NULL OR interest_score BETWEEN 0 AND 100),

  -- [{ "egenskap": "sted:bla", "vekt": 0.8 }, …] — de sterkeste grunnene.
  ADD COLUMN IF NOT EXISTS interest_reasons JSONB,

  -- Felt et godt Påby-kort trenger, men som mangler (se core/kvalitet.js).
  ADD COLUMN IF NOT EXISTS missing_fields TEXT[] NOT NULL DEFAULT '{}',

  -- Satt når agenten har holdt eventet ute (lært eller manuell regel).
  -- Raden er fortsatt 'pending' — den skjules bare i "Fra API" til noen
  -- ser på den, slik at en feil regel aldri sletter noe stille.
  ADD COLUMN IF NOT EXISTS kept_out_reason TEXT,

  -- Satt når en person har lagt eventet i agentens utvalg selv (fra
  -- «Usikre» eller «Ikke valgt» i Fra API). Nye kjøringer holder det aldri
  -- ute igjen — personen har allerede sagt at det er verdt å se på.
  ADD COLUMN IF NOT EXISTS included_manually BOOLEAN NOT NULL DEFAULT FALSE,

  -- Hvorfor en person avslo (se REJECT_REASONS i collector/core/interesse.js).
  -- 'duplikat'/'mangler-info'/'passert' lærer modellen ingenting om smak.
  ADD COLUMN IF NOT EXISTS reject_reason TEXT;


-- Append-only logg over hver beslutning i review. event_candidates.status
-- sier bare hvor raden står NÅ — denne sier hvem, når, hvorfor, og hva
-- agenten trodde på det tidspunktet (for å kunne måle om den blir bedre).
CREATE TABLE IF NOT EXISTS candidate_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    candidate_id UUID NOT NULL REFERENCES event_candidates(id)
        ON DELETE CASCADE,

    decision TEXT NOT NULL
        CHECK (decision IN ('triaged', 'approved', 'rejected', 'included')),

    reason TEXT,

    interest_score REAL,
    kept_out_reason TEXT,

    decided_by UUID REFERENCES admin_users(id)
        ON DELETE SET NULL,

    decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_candidate_decisions_candidate_id
    ON candidate_decisions(candidate_id);

CREATE INDEX IF NOT EXISTS idx_candidate_decisions_decided_at
    ON candidate_decisions(decided_at);

CREATE INDEX IF NOT EXISTS idx_event_candidates_collector_run_id
    ON event_candidates(collector_run_id);
