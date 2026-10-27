-- Historikk over hvordan eksterne kilder (event_sources) faktisk endrer
-- data over tid. CHANGED-policyen fra 009_external_source_identity.sql
-- endres IKKE av dette — content_hash på selve event_sources-raden fryses
-- fortsatt til en person håndterer endringen (se collector/run.js).
--
-- content_snapshot lagrer DE SAMME feltene som content_hash faktisk hasher
-- (se collector/core/hash.js) — nødvendig for å kunne si NOE om HVILKE felt
-- som endret seg, ikke bare AT noe endret seg. Oppdateres hver gang vi ser
-- en NY eller CHANGED versjon av kilde-eventet (contentHash matcher alltid
-- content_snapshot), uavhengig av at content_hash selv fryses ved CHANGED.
--
-- event_source_changes får KUN en ny rad når observert hash avviker fra
-- SIST LOGGEDE hash for denne kilden (ikke bare fra den opprinnelig frosne
-- content_hash) — se collector/run.js. Uten denne dedupen ville samme,
-- uløste endring blitt logget på nytt hver collector-kjøring, i stedet for
-- én gang pr. faktisk endring hos kilden.

ALTER TABLE event_sources
  ADD COLUMN content_snapshot JSONB;

CREATE TABLE event_source_changes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    event_source_id UUID NOT NULL REFERENCES event_sources(id)
        ON DELETE CASCADE,

    observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    previous_content_hash TEXT,
    observed_content_hash TEXT NOT NULL,

    -- Navn på feltene fra content_snapshot som faktisk endret seg.
    changed_fields TEXT[] NOT NULL DEFAULT '{}',

    -- Liten diff: { "felt": { "fra": ..., "til": ... } }. Ikke et fullt
    -- event-sourcing-system — kun de feltene som endret seg.
    diff JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_event_source_changes_event_source_id
    ON event_source_changes(event_source_id, observed_at);
