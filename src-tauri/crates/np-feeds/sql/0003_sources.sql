-- Subproyecto 3: fuentes, índice, hechos, línea editorial, temas, vigilancias y hemeroteca.
CREATE TABLE outlets (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  domain    TEXT NOT NULL UNIQUE,
  country   TEXT NOT NULL,
  language  TEXT NOT NULL,
  kind      TEXT NOT NULL DEFAULT 'medio',
  custom    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE feeds (
  id              INTEGER PRIMARY KEY,
  outlet_id       TEXT NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  url             TEXT NOT NULL UNIQUE,
  etag            TEXT,
  last_modified   TEXT,
  last_fetched_at INTEGER,
  last_status     INTEGER,
  last_error      TEXT
);

CREATE TABLE articles (
  id           INTEGER PRIMARY KEY,
  url          TEXT NOT NULL UNIQUE,
  outlet_id    TEXT REFERENCES outlets(id),
  title        TEXT NOT NULL,
  summary      TEXT NOT NULL DEFAULT '',
  language     TEXT NOT NULL DEFAULT 'es',
  published_at INTEGER NOT NULL,
  fetched_at   INTEGER NOT NULL,
  origin       TEXT NOT NULL DEFAULT 'rss',
  topic        TEXT
);
CREATE INDEX idx_articles_published ON articles(published_at);
CREATE INDEX idx_articles_outlet ON articles(outlet_id);

CREATE VIRTUAL TABLE articles_fts USING fts5(
  title, summary, content = 'articles', content_rowid = 'id', tokenize = 'unicode61 remove_diacritics 2'
);
CREATE TRIGGER articles_ai AFTER INSERT ON articles BEGIN
  INSERT INTO articles_fts(rowid, title, summary) VALUES (new.id, new.title, new.summary);
END;
CREATE TRIGGER articles_ad AFTER DELETE ON articles BEGIN
  INSERT INTO articles_fts(articles_fts, rowid, title, summary) VALUES ('delete', old.id, old.title, old.summary);
END;
CREATE TRIGGER articles_au AFTER UPDATE ON articles BEGIN
  INSERT INTO articles_fts(articles_fts, rowid, title, summary) VALUES ('delete', old.id, old.title, old.summary);
  INSERT INTO articles_fts(rowid, title, summary) VALUES (new.id, new.title, new.summary);
END;

CREATE TABLE events (
  id         INTEGER PRIMARY KEY,
  title      TEXT NOT NULL,
  language   TEXT NOT NULL DEFAULT 'es',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE event_articles (
  event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  article_id INTEGER NOT NULL UNIQUE REFERENCES articles(id) ON DELETE CASCADE,
  similarity REAL NOT NULL,
  PRIMARY KEY (event_id, article_id)
);

CREATE TABLE outlet_stats (
  outlet_id      TEXT PRIMARY KEY REFERENCES outlets(id) ON DELETE CASCADE,
  framing_mean   REAL,
  framing_se     REAL,
  framing_n      INTEGER NOT NULL DEFAULT 0,
  by_topic_json  TEXT NOT NULL DEFAULT '[]',
  reliability    REAL,
  reliability_n  INTEGER NOT NULL DEFAULT 0,
  computed_at    INTEGER NOT NULL
);

-- Sincronizables (id UUID v5, updated_at HLC, deleted).
CREATE TABLE outlet_overrides (
  outlet_id  TEXT PRIMARY KEY,
  id         TEXT NOT NULL UNIQUE,
  lean       REAL CHECK (lean IS NULL OR (lean >= 0 AND lean <= 100)),
  note       TEXT,
  updated_at TEXT NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE custom_outlets (
  domain     TEXT PRIMARY KEY,
  id         TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  feeds_json TEXT NOT NULL DEFAULT '[]',
  language   TEXT NOT NULL,
  country    TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE topics (
  topic_id   TEXT PRIMARY KEY,
  id         TEXT NOT NULL UNIQUE,
  following  INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE watches (
  id           TEXT PRIMARY KEY,
  article_url  TEXT,
  query        TEXT,
  event_id     INTEGER,
  created_at   INTEGER NOT NULL,
  fulfilled_at INTEGER,
  updated_at   TEXT NOT NULL,
  deleted      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE wayback_cdx (
  url        TEXT PRIMARY KEY,
  json       TEXT NOT NULL,
  fetched_at INTEGER NOT NULL
);

CREATE TABLE wayback_captures (
  url            TEXT NOT NULL,
  timestamp      TEXT NOT NULL,
  digest         TEXT NOT NULL,
  extracted_json TEXT,
  fetched_at     INTEGER NOT NULL,
  PRIMARY KEY (url, timestamp)
);
