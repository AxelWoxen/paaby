-- Autentisering for Påby Admin (admin.paaby.no).
--
-- To ting:
-- 1) admin_users — hvem som kan logge inn. Ingen offentlig registrering:
--    rader opprettes kun via collector/review/scripts/opprett-bruker.mjs,
--    kjørt manuelt av eieren. Passord lagres aldri i klartekst, kun som
--    bcrypt-hash.
-- 2) session — server-side sessions (express-session + connect-pg-simple).
--    Skjemaet under er nøyaktig det connect-pg-simple forventer som
--    standard (tableName: 'session') — se dens README. createTableIfMissing
--    er satt til false i server.js, slik at ingenting migreres automatisk.

CREATE TABLE admin_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,

  -- Kun 'admin' brukes i dag. 'editor'/'viewer' finnes som fremtidig rom
  -- for redusert tilgang — ingen ruter håndhever forskjellen ennå.
  role          TEXT NOT NULL DEFAULT 'admin'
                  CHECK (role IN ('admin', 'editor', 'viewer')),

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE TABLE "session" (
  "sid"    VARCHAR      NOT NULL COLLATE "default",
  "sess"   JSON         NOT NULL,
  "expire" TIMESTAMP(6) NOT NULL,

  CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
);

CREATE INDEX "IDX_session_expire" ON "session" ("expire");
