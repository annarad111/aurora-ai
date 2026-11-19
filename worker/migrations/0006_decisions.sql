-- Insight to action: insights the user saved and the actions they decided on.
--
-- One table for both, each record stored as JSON with the version of its
-- format, so the shape can change without a migration per field; the Worker
-- validates every record when it reads it and skips one that no longer fits.

CREATE TABLE decision_records (
  id              TEXT PRIMARY KEY,
  hotel_id        TEXT NOT NULL REFERENCES hotels (id),
  kind            TEXT NOT NULL CHECK (kind IN ('insight', 'action')),
  -- Insights: what was saved ("briefing:pace:…", "answer:<run id>"), so saving twice keeps one.
  source_key      TEXT,
  -- Actions: the saved insight they belong to.
  parent_id       TEXT,
  record_version  INTEGER NOT NULL,
  record_json     TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE UNIQUE INDEX decision_records_one_per_source ON decision_records (hotel_id, kind, source_key) WHERE source_key IS NOT NULL;
CREATE INDEX decision_records_by_hotel ON decision_records (hotel_id, kind, created_at);
