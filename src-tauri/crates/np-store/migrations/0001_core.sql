-- Subproyecto 1: núcleo. Las tablas sincronizables llevan id (UUID), updated_at (HLC) y deleted (lápida).
CREATE TABLE local_meta (
  key   TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE TABLE settings (
  key        TEXT PRIMARY KEY NOT NULL,
  id         TEXT NOT NULL UNIQUE,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE analyses (
  id         TEXT PRIMARY KEY NOT NULL,
  url        TEXT NOT NULL,
  text_hash  TEXT NOT NULL,
  stage      TEXT NOT NULL,
  json       TEXT NOT NULL,
  model      TEXT,
  cost       REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0,
  UNIQUE (url, text_hash, stage)
);
CREATE INDEX analyses_created ON analyses(created_at);

CREATE TABLE history (
  id         TEXT PRIMARY KEY NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('visit', 'search')),
  url        TEXT,
  title      TEXT,
  outlet     TEXT,
  query      TEXT,
  source     TEXT,
  analyzed   INTEGER NOT NULL DEFAULT 0,
  at         INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX history_at ON history(at);
CREATE INDEX history_outlet ON history(outlet);

CREATE VIRTUAL TABLE history_fts USING fts5(
  title, url, query, outlet,
  content = 'history', content_rowid = 'rowid',
  tokenize = 'unicode61 remove_diacritics 2'
);
CREATE TRIGGER history_ai AFTER INSERT ON history BEGIN
  INSERT INTO history_fts(rowid, title, url, query, outlet) VALUES (new.rowid, new.title, new.url, new.query, new.outlet);
END;
CREATE TRIGGER history_ad AFTER DELETE ON history BEGIN
  INSERT INTO history_fts(history_fts, rowid, title, url, query, outlet) VALUES ('delete', old.rowid, old.title, old.url, old.query, old.outlet);
END;
CREATE TRIGGER history_au AFTER UPDATE ON history BEGIN
  INSERT INTO history_fts(history_fts, rowid, title, url, query, outlet) VALUES ('delete', old.rowid, old.title, old.url, old.query, old.outlet);
  INSERT INTO history_fts(rowid, title, url, query, outlet) VALUES (new.rowid, new.title, new.url, new.query, new.outlet);
END;
