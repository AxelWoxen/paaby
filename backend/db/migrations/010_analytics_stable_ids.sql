-- Utvider analytics_events med stabile interne UUID-er, slik at historiske
-- analytics-rader kan overleve endring av slug/legacy_id, bedre
-- deduplisering og fremtidig entity resolution (se 008_analytics.sql for
-- base_event_id, som denne komplementerer).
--
-- event_uuid/occurrence_uuid er bevisst IKKE foreign keys mot events/
-- event_occurrences — samme resonnement som base_event_id allerede har:
-- events kan arkiveres/slettes uten at historiske analytics-rader skal
-- ødelegges. Begge slås opp og settes server-side (via legacy_id) i
-- backend/services/analyticsService.mjs — klienten sender fortsatt kun
-- dagens frontend-ID, og vet ingenting om disse feltene.
--
-- occurrence_uuid er kun satt når analytics-eventet faktisk peker på
-- eventets EGEN (ikke-gjentakende) forekomst. Gjentakende eventers
-- dato-spesifikke visninger ("<base-id>__YYYY-MM-DD") er syntetiske,
-- generert client-side (js/application/gjentas.js) og har ingen egen
-- event_occurrences-rad — occurrence_uuid forblir NULL for disse, se
-- kommentar i analyticsService.mjs. Én events-rad har i dag alltid
-- nøyaktig én event_occurrences-rad (se collector/store/published.js og
-- collector/tests/publish-multi-showtime.test.mjs), så oppslaget er trygt.

ALTER TABLE analytics_events
  ADD COLUMN event_uuid UUID,
  ADD COLUMN occurrence_uuid UUID;

CREATE INDEX IF NOT EXISTS idx_analytics_events_event_uuid
    ON analytics_events(event_uuid);
