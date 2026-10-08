-- v1-tagsystem for events.
--
-- Samme mønster som categories/event_categories i 001_initial_schema.sql:
-- "tags" er de tillatte verdiene, "event_tags" er many-to-many-koblingen.
-- IF NOT EXISTS / ON CONFLICT DO NOTHING gjør migrasjonen trygg å kjøre
-- flere ganger (f.eks. ved uhell i produksjon).

CREATE TABLE IF NOT EXISTS tags (
    slug TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);


CREATE TABLE IF NOT EXISTS event_tags (
    event_id UUID NOT NULL REFERENCES events(id)
        ON DELETE CASCADE,

    tag_slug TEXT NOT NULL REFERENCES tags(slug)
        ON DELETE CASCADE,

    PRIMARY KEY (event_id, tag_slug)
);


CREATE INDEX IF NOT EXISTS idx_event_tags_tag_slug
    ON event_tags(tag_slug);


-- =========================================================
-- V1-TAGS
-- Listen er bevisst fast i v1 — nye tags krever en egen migrasjon,
-- ikke fritekst fra admin.
-- =========================================================

INSERT INTO tags (slug, name)
VALUES
    ('free',         'Free'),
    ('drop-in',      'Drop-in'),
    ('ticket',       'Ticket'),
    ('outdoor',      'Outdoor'),
    ('indoor',       'Indoor'),
    ('daytime',      'Daytime'),
    ('evening',      'Evening'),
    ('late-evening', 'Late evening'),
    ('18+',          '18+'),
    ('20+',          '20+'),
    ('live',         'Live'),
    ('dj',           'DJ'),
    ('activity',     'Activity'),
    ('market',       'Market'),
    ('community',    'Community'),
    ('pop-up',       'Pop-up'),
    ('festival',     'Festival')

ON CONFLICT (slug) DO NOTHING;
