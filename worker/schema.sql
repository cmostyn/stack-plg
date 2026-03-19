CREATE TABLE IF NOT EXISTS cs_actions (
  id          TEXT PRIMARY KEY,
  hubspot_id  TEXT NOT NULL,
  name        TEXT NOT NULL,
  priority    TEXT NOT NULL CHECK(priority IN ('high', 'med', 'low')),
  done        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);
