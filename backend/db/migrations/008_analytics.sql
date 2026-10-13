-- Første-parts produktanalyse (Innsikt).
--
-- Pseudonymt, ikke anonymt: visitor_id er en tilfeldig UUID generert i
-- nettleseren ETTER statistikk-samtykke (se js/application/analyse-identitet.js),
-- lagret lokalt. Ingen navn, e-post, IP, User-Agent, eksakt posisjon eller
-- fingerprinting lagres noe sted i disse tabellene.
--
-- base_event_id er bevisst IKKE en foreign key mot events.legacy_id: events kan
-- arkiveres/slettes uten at det skal ødelegge historiske analytics-rader, og
-- legacy_id er nullable for fremtidige events (se 001_initial_schema.sql).

CREATE TABLE IF NOT EXISTS analytics_visitors (
    visitor_id UUID PRIMARY KEY,

    first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_visitors_first_seen
    ON analytics_visitors(first_seen);


-- platform: 'web' i dag. Skjemaet tar høyde for 'ios'/'android' (fremtidig
-- Expo-app) uten endring — se oppgavebeskrivelsen DEL 11.
CREATE TABLE IF NOT EXISTS analytics_sessions (
    session_id UUID PRIMARY KEY,

    visitor_id UUID NOT NULL REFERENCES analytics_visitors(visitor_id)
        ON DELETE CASCADE,

    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    platform TEXT NOT NULL DEFAULT 'web'
        CHECK (platform IN ('web', 'ios', 'android')),

    -- Kun vert, ikke full referrer-URL med query-params (datamin.).
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    referrer_host TEXT
);

CREATE INDEX IF NOT EXISTS idx_analytics_sessions_visitor_id
    ON analytics_sessions(visitor_id);

CREATE INDEX IF NOT EXISTS idx_analytics_sessions_started_at
    ON analytics_sessions(started_at);


-- event_id = eksakt frontend-ID (kan være en occurrence-ID, "<base>__YYYY-MM-DD").
-- base_event_id = grunn-eventets legacy_id, utledet server-side (se
-- js/application/analytics-events.js:utledBaseEventId) — ALDRI stolt blindt på
-- klienten for dette. properties er et bevisst begrenset sett (se
-- backend/services/analyticsService.mjs), ikke fritekst-JSON.
CREATE TABLE IF NOT EXISTS analytics_events (
    id BIGSERIAL PRIMARY KEY,

    visitor_id UUID NOT NULL REFERENCES analytics_visitors(visitor_id)
        ON DELETE CASCADE,

    session_id UUID NOT NULL REFERENCES analytics_sessions(session_id)
        ON DELETE CASCADE,

    event_name TEXT NOT NULL,

    event_id TEXT,
    base_event_id TEXT,
    category TEXT,

    properties JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Server setter tidspunktet — klient-timestamp er ikke sannhet.
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_visitor_name_created
    ON analytics_events(visitor_id, event_name, created_at);

CREATE INDEX IF NOT EXISTS idx_analytics_events_base_event_name
    ON analytics_events(base_event_id, event_name);

CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at
    ON analytics_events(created_at);


-- STATE, ikke eventlogg: hva denne anonyme/pseudonyme brukeren faktisk har
-- lagret AKKURAT NÅ. Lagring → upsert, fjerning → delete (se
-- backend/services/analyticsService.mjs). Lar oss svare korrekt på
-- "hvor mange har minst ett event lagret akkurat nå" uten å telle historiske
-- event_lagret/event_fjernet_lagret-rader mot hverandre.
CREATE TABLE IF NOT EXISTS analytics_saved_events (
    visitor_id UUID NOT NULL REFERENCES analytics_visitors(visitor_id)
        ON DELETE CASCADE,

    event_id TEXT NOT NULL,
    base_event_id TEXT,

    saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (visitor_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_analytics_saved_events_visitor_id
    ON analytics_saved_events(visitor_id);
