-- TCM Events — database schema
-- Run automatically by `npm run migrate`, or manually: psql "$DATABASE_URL" -f schema.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- provides gen_random_uuid()

-- One row per event. `state` is the full serialized app state for that event
-- (checklists, dates, RACI, annual plan, protocol notes) as JSON — this mirrors
-- the shape the frontend already produces, so the migration stays minimal.
CREATE TABLE IF NOT EXISTS events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  type        TEXT,
  event_date  DATE,
  state       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Metadata for uploaded documents. The bytes live in Cloudflare R2 under `storage_key`;
-- only metadata is kept here. `status` is 'pending' until the browser confirms the
-- direct-to-R2 upload finished.
CREATE TABLE IF NOT EXISTS documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  filename      TEXT NOT NULL,
  content_type  TEXT,
  size          BIGINT,
  storage_key   TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending | ready
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documents_event_id ON documents(event_id);
