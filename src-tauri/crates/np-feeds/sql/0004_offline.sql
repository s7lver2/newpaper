-- Subproyecto 3: artículos guardados (sincronizables) y ediciones sin conexión (locales).
CREATE TABLE saved_articles (
  url          TEXT PRIMARY KEY,
  id           TEXT NOT NULL UNIQUE,
  title        TEXT NOT NULL,
  outlet       TEXT,
  article_json TEXT NOT NULL,
  saved_at     INTEGER NOT NULL,
  updated_at   TEXT NOT NULL,
  deleted      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE offline_editions (
  id           TEXT PRIMARY KEY,
  date         TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  summary_json TEXT NOT NULL DEFAULT '{}',
  bytes        INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'building'
);

CREATE TABLE offline_articles (
  edition_id    TEXT NOT NULL REFERENCES offline_editions(id) ON DELETE CASCADE,
  url           TEXT NOT NULL,
  title         TEXT NOT NULL,
  outlet        TEXT,
  article_json  TEXT NOT NULL,
  analysis_json TEXT,
  PRIMARY KEY (edition_id, url)
);

CREATE VIRTUAL TABLE offline_fts USING fts5(
  title, body, kind UNINDEXED, reference UNINDEXED, tokenize = 'unicode61 remove_diacritics 2'
);
