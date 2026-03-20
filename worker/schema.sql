CREATE TABLE IF NOT EXISTS cs_actions (
  id          TEXT PRIMARY KEY,
  hubspot_id  TEXT NOT NULL,
  name        TEXT NOT NULL,
  priority    TEXT NOT NULL CHECK(priority IN ('high', 'med', 'low')),
  done        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  due_date    TEXT             -- ISO date YYYY-MM-DD, nullable
);

CREATE TABLE IF NOT EXISTS health (
  hubspot_id TEXT PRIMARY KEY,
  status     TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
  hubspot_id TEXT PRIMARY KEY,
  body       TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
