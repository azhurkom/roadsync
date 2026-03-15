-- RoadSync PostgreSQL Schema
-- Run: psql $DATABASE_URL -f schema.sql

-- NextAuth required tables
CREATE TABLE IF NOT EXISTS accounts (
  id                TEXT NOT NULL PRIMARY KEY,
  user_id           TEXT NOT NULL,
  type              TEXT NOT NULL,
  provider          TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  refresh_token     TEXT,
  access_token      TEXT,
  expires_at        BIGINT,
  token_type        TEXT,
  scope             TEXT,
  id_token          TEXT,
  session_state     TEXT,
  UNIQUE(provider, provider_account_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT NOT NULL PRIMARY KEY,
  session_token TEXT NOT NULL UNIQUE,
  user_id       TEXT NOT NULL,
  expires       TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id              TEXT NOT NULL PRIMARY KEY,
  name            TEXT,
  email           TEXT UNIQUE,
  email_verified  TIMESTAMPTZ,
  image           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS verification_tokens (
  identifier TEXT NOT NULL,
  token      TEXT NOT NULL,
  expires    TIMESTAMPTZ NOT NULL,
  UNIQUE(identifier, token)
);

-- App tables
CREATE TABLE IF NOT EXISTS cadences (
  id              TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  firm_name       TEXT NOT NULL,
  start_date      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_date        TIMESTAMPTZ,
  vehicle_number  TEXT NOT NULL,
  trailer_number  TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trips (
  id                TEXT NOT NULL PRIMARY KEY,
  cadence_id        TEXT NOT NULL REFERENCES cadences(id) ON DELETE CASCADE,
  description       TEXT NOT NULL,
  reference_number  TEXT,
  load_addresses    JSONB NOT NULL DEFAULT '[]',
  unload_addresses  JSONB NOT NULL DEFAULT '[]',
  shift_ids         JSONB NOT NULL DEFAULT '[]',
  is_closed         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS action_logs (
  id                  TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  cadence_id          TEXT NOT NULL REFERENCES cadences(id) ON DELETE CASCADE,
  trip_id             TEXT,
  timestamp           TIMESTAMPTZ NOT NULL,
  odometer            INTEGER NOT NULL,
  location_latitude   DOUBLE PRECISION NOT NULL DEFAULT 0,
  location_longitude  DOUBLE PRECISION NOT NULL DEFAULT 0,
  location_name       TEXT NOT NULL DEFAULT '',
  action_type         TEXT NOT NULL,
  notes               TEXT,
  weight              INTEGER,
  driving_time        TEXT,
  file_url            TEXT,
  new_vehicle_number  TEXT,
  new_trailer_number  TEXT,
  old_vehicle_number  TEXT,
  old_trailer_number  TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expenses (
  id              TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  cadence_id      TEXT NOT NULL REFERENCES cadences(id) ON DELETE CASCADE,
  timestamp       TIMESTAMPTZ NOT NULL,
  type            TEXT NOT NULL,
  amount          DOUBLE PRECISION NOT NULL,
  payment_method  TEXT NOT NULL,
  liters          DOUBLE PRECISION,
  receipt_url     TEXT,
  odometer        INTEGER NOT NULL,
  location_name   TEXT NOT NULL DEFAULT '',
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS addresses (
  id                TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  address           TEXT NOT NULL,
  entry_latitude    DOUBLE PRECISION,
  entry_longitude   DOUBLE PRECISION,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS files (
  id          TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename    TEXT NOT NULL,
  mime_type   TEXT NOT NULL,
  size_bytes  INTEGER NOT NULL,
  data        BYTEA NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_cadences_user_id ON cadences(user_id);
CREATE INDEX IF NOT EXISTS idx_cadences_end_date ON cadences(end_date) WHERE end_date IS NULL;
CREATE INDEX IF NOT EXISTS idx_trips_cadence_id ON trips(cadence_id);
CREATE INDEX IF NOT EXISTS idx_trips_is_closed ON trips(is_closed);
CREATE INDEX IF NOT EXISTS idx_action_logs_cadence_id ON action_logs(cadence_id);
CREATE INDEX IF NOT EXISTS idx_action_logs_timestamp ON action_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_cadence_id ON expenses(cadence_id);
CREATE INDEX IF NOT EXISTS idx_expenses_timestamp ON expenses(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON addresses(user_id);
