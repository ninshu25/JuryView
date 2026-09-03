-- NOTaJury schema. Safe to run repeatedly.
-- You can feed cases and trial events straight into these tables with SQL;
-- the API reads the same rows.

CREATE TABLE IF NOT EXISTS cases (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  summary     TEXT NOT NULL DEFAULT '',
  defendant   TEXT NOT NULL DEFAULT '',
  charge      TEXT NOT NULL DEFAULT '',
  round       INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jurors (
  id          TEXT PRIMARY KEY,
  case_id     TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  seat        INTEGER NOT NULL,
  name        TEXT NOT NULL,
  archetype   TEXT NOT NULL DEFAULT '',
  bio         TEXT NOT NULL DEFAULT '',
  traits      JSONB NOT NULL,
  UNIQUE (case_id, seat)
);

CREATE TABLE IF NOT EXISTS events (
  id          TEXT PRIMARY KEY,
  case_id     TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  round       INTEGER NOT NULL,
  kind        TEXT NOT NULL,
  title       TEXT NOT NULL,
  content     TEXT NOT NULL DEFAULT '',
  side        TEXT NOT NULL DEFAULT 'neutral',
  strength    REAL NOT NULL DEFAULT 0.5,
  emotional   REAL NOT NULL DEFAULT 0.3,
  authority   REAL NOT NULL DEFAULT 0.3,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS juror_positions (
  case_id        TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  juror_id       TEXT NOT NULL REFERENCES jurors(id) ON DELETE CASCADE,
  round          INTEGER NOT NULL,
  lean           REAL NOT NULL,
  leaning        TEXT NOT NULL,
  confidence     REAL NOT NULL,
  reasoning      TEXT NOT NULL DEFAULT '',
  key_factors    JSONB NOT NULL DEFAULT '[]'::jsonb,
  delta          REAL NOT NULL DEFAULT 0,
  evidence_delta REAL NOT NULL DEFAULT 0,
  peer_delta     REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (juror_id, round)
);

CREATE TABLE IF NOT EXISTS jury_snapshots (
  case_id        TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  round          INTEGER NOT NULL,
  event_id       TEXT,
  jury_lean      REAL NOT NULL,
  guilty_pct     REAL NOT NULL,
  not_guilty_pct REAL NOT NULL,
  uncertain_pct  REAL NOT NULL,
  consensus      REAL NOT NULL,
  confidence     REAL NOT NULL,
  unanimous      BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (case_id, round)
);

CREATE TABLE IF NOT EXISTS influences (
  case_id        TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  round          INTEGER NOT NULL,
  from_juror_id  TEXT NOT NULL,
  to_juror_id    TEXT NOT NULL,
  magnitude      REAL NOT NULL
);

-- Scraped articles. One row per URL fed to the scraper service.
CREATE TABLE IF NOT EXISTS sources (
  id           TEXT PRIMARY KEY,
  case_id      TEXT REFERENCES cases(id) ON DELETE SET NULL,
  url          TEXT NOT NULL UNIQUE,
  title        TEXT NOT NULL DEFAULT '',
  intro        TEXT NOT NULL DEFAULT '',
  publisher    TEXT NOT NULL DEFAULT '',
  entry_count  INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'ok',
  error        TEXT NOT NULL DEFAULT '',
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Individual live-blog posts pulled out of a source. These are raw material:
-- nothing here is a trial event until it is explicitly promoted into one.
CREATE TABLE IF NOT EXISTS source_entries (
  id              TEXT PRIMARY KEY,
  source_id       TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  external_id     TEXT NOT NULL DEFAULT '',
  seq             INTEGER NOT NULL,
  author          TEXT NOT NULL DEFAULT '',
  posted_at_text  TEXT NOT NULL DEFAULT '',
  posted_at       TIMESTAMPTZ,
  heading         TEXT NOT NULL DEFAULT '',
  body            TEXT NOT NULL DEFAULT '',
  transcript      JSONB NOT NULL DEFAULT '[]'::jsonb,
  promoted_event_id TEXT,
  UNIQUE (source_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_source_entries_source ON source_entries(source_id, seq);

-- Additive migrations for existing databases.
ALTER TABLE events ADD COLUMN IF NOT EXISTS transcript JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE cases  ADD COLUMN IF NOT EXISTS real_case BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE cases  ADD COLUMN IF NOT EXISTS source_note TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_events_case ON events(case_id, round);
CREATE INDEX IF NOT EXISTS idx_positions_case ON juror_positions(case_id, round);
CREATE INDEX IF NOT EXISTS idx_influences_case ON influences(case_id, round);
