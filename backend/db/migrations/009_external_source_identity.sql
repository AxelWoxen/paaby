-- Utvider event_sources (fra 001_initial_schema.sql) til å fungere som
-- Påbys eneste "ekstern kilde-identitet"-tabell — i stedet for å lage en
-- parallell tabell med nesten samme ansvar.
--
-- event_sources ble opprinnelig laget for nettopp dette (provider +
-- external_id som stabil kildeidentitet), men ble aldri tatt i bruk. Den
-- pekte kun på events(id), dvs. kun ALLEREDE PUBLISERTE eventer — collectoren
-- trenger å kjenne igjen en ekstern kilde-event FØR den i det hele tatt er
-- en candidate, så event_id må bli valgfri og vi trenger en kobling til
-- event_candidates i tillegg.
--
-- Begrepsbruk bevisst uendret fra 001_initial_schema.sql:
--   provider    = hvilken plattform ("broadcast-events", "ticketmaster", …)
--   external_id = kildens egen, stabile event-id
--   source_url  = kildens egen (kanoniske) lenke til eventet
--
-- content_hash brukes til å avgjøre NEW / UNCHANGED / CHANGED ved neste
-- collector-kjøring — se collector/core/hash.js og collector/core/sync.js.

ALTER TABLE event_sources
  ALTER COLUMN event_id DROP NOT NULL;

ALTER TABLE event_sources
  ADD COLUMN candidate_id UUID REFERENCES event_candidates(id)
    ON DELETE SET NULL,

  ADD COLUMN source_status TEXT,

  ADD COLUMN source_updated_at TIMESTAMPTZ,

  ADD COLUMN content_hash TEXT;

-- event_id (uendret navn/fremmednøkkel) peker nå på det PUBLISERTE eventet
-- når/hvis candidaten blir godkjent — candidate_id beholdes samtidig som
-- provenance, se markerGodkjent() i collector/store/candidates-db.js.
CREATE INDEX idx_event_sources_candidate_id
  ON event_sources(candidate_id);
