CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- =========================================================
-- VENUES
-- Ett sted lagres én gang og kan brukes av mange events.
-- =========================================================

CREATE TABLE venues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,

    address TEXT,
    latitude DOUBLE PRECISION
        CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
    longitude DOUBLE PRECISION
        CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =========================================================
-- EVENTS
-- Selve arrangementet, uavhengig av når det forekommer.
-- =========================================================

CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- ID fra gamle events.json.
    -- Nullable fordi fremtidige events ikke trenger denne.
    legacy_id TEXT UNIQUE,

    title TEXT NOT NULL,
    description TEXT,
    curator_text TEXT,

    venue_id UUID REFERENCES venues(id)
        ON DELETE SET NULL,

    event_url TEXT,
    image_url TEXT,

    -- Beholder samme betydning som dagens "pris".
    -- price_text gir den menneskevennlige/fullstendige forklaringen.
    price_nok INTEGER
        CHECK (price_nok IS NULL OR price_nok >= 0),

    price_text TEXT,

    -- Bevarer dagens formater:
    -- ukentlig:søndag
    -- månedlig:siste-torsdag
    -- osv.
    recurrence_rule_raw TEXT,

    featured BOOLEAN NOT NULL DEFAULT FALSE,

    last_verified_at TIMESTAMPTZ,

    status TEXT NOT NULL DEFAULT 'active'
        CHECK (
            status IN (
                'active',
                'inactive',
                'cancelled',
                'archived'
            )
        ),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =========================================================
-- EVENT OCCURRENCES
-- Faktiske datoer/tidspunkt et event skjer.
-- =========================================================

CREATE TABLE event_occurrences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    event_id UUID NOT NULL REFERENCES events(id)
        ON DELETE CASCADE,

    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ,

    status TEXT NOT NULL DEFAULT 'scheduled'
        CHECK (
            status IN (
                'scheduled',
                'cancelled'
            )
        ),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (
        ends_at IS NULL
        OR ends_at >= starts_at
    ),

    UNIQUE (event_id, starts_at)
);


-- =========================================================
-- CATEGORIES
-- =========================================================

CREATE TABLE categories (
    slug TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);


-- Mange-til-mange gjør at vi senere kan ha f.eks.
-- både "mat" og "påfunn" på samme arrangement.
CREATE TABLE event_categories (
    event_id UUID NOT NULL REFERENCES events(id)
        ON DELETE CASCADE,

    category_slug TEXT NOT NULL REFERENCES categories(slug)
        ON DELETE CASCADE,

    PRIMARY KEY (event_id, category_slug)
);


-- =========================================================
-- SOURCES
-- Collectorens kilde/proveniens.
--
-- Dette er separat fra events.event_url:
-- event_url = lenken brukeren skal åpne
-- source_url = hvor collectoren fant informasjonen
-- =========================================================

CREATE TABLE event_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    event_id UUID NOT NULL REFERENCES events(id)
        ON DELETE CASCADE,

    provider TEXT NOT NULL,

    external_id TEXT,
    source_url TEXT,

    last_seen_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (provider, external_id)
);


-- =========================================================
-- UPDATED_AT
-- PostgreSQL oppdaterer updated_at automatisk.
-- =========================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


CREATE TRIGGER venues_set_updated_at
BEFORE UPDATE ON venues
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


CREATE TRIGGER events_set_updated_at
BEFORE UPDATE ON events
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


CREATE TRIGGER occurrences_set_updated_at
BEFORE UPDATE ON event_occurrences
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


CREATE TRIGGER sources_set_updated_at
BEFORE UPDATE ON event_sources
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


-- =========================================================
-- INDEXES
-- =========================================================

CREATE INDEX idx_events_venue_id
    ON events(venue_id);

CREATE INDEX idx_events_status
    ON events(status);

CREATE INDEX idx_events_featured
    ON events(featured);

CREATE INDEX idx_occurrences_event_id
    ON event_occurrences(event_id);

CREATE INDEX idx_occurrences_starts_at
    ON event_occurrences(starts_at);

CREATE INDEX idx_occurrences_status_starts_at
    ON event_occurrences(status, starts_at);

CREATE INDEX idx_event_categories_category
    ON event_categories(category_slug);

CREATE INDEX idx_event_sources_event_id
    ON event_sources(event_id);


-- =========================================================
-- INITIAL CATEGORIES
-- =========================================================

INSERT INTO categories (slug, name)
VALUES
    ('musikk', 'Musikk'),
    ('klubb', 'Klubb'),
    ('pafunn', 'Påfunn');
