CREATE TABLE IF NOT EXISTS content_updates (
  id INTEGER PRIMARY KEY,
  manifest_version INTEGER NOT NULL,
  applied_at INTEGER NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('apply', 'revert')),
  resources TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS content_updates_at ON content_updates(applied_at DESC);
