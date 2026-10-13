-- Subproyecto 7: pares, registro de envíos y diario local de cambios (alimentado por disparadores).
CREATE TABLE IF NOT EXISTS sync_peers (
  id           TEXT PRIMARY KEY NOT NULL,
  name         TEXT NOT NULL,
  public_key   TEXT NOT NULL,
  addresses    TEXT NOT NULL DEFAULT '[]',
  scopes       TEXT NOT NULL DEFAULT '[]',
  send_keys    INTEGER NOT NULL DEFAULT 0,
  paired_at    INTEGER NOT NULL,
  last_sync_at INTEGER,
  revoked      INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sync_log (
  peer_id    TEXT PRIMARY KEY NOT NULL REFERENCES sync_peers(id) ON DELETE CASCADE,
  sent_seq   INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);
-- Diario local: la última modificación de cada fila sincronizable, con una secuencia creciente.
CREATE TABLE IF NOT EXISTS sync_journal (
  seq    INTEGER PRIMARY KEY AUTOINCREMENT,
  tbl    TEXT NOT NULL,
  row_id TEXT NOT NULL,
  UNIQUE (tbl, row_id)
);
CREATE TRIGGER IF NOT EXISTS sj_settings_i AFTER INSERT ON settings BEGIN DELETE FROM sync_journal WHERE tbl = 'settings' AND row_id = NEW.id; INSERT INTO sync_journal(tbl, row_id) VALUES ('settings', NEW.id); END;
CREATE TRIGGER IF NOT EXISTS sj_settings_u AFTER UPDATE ON settings BEGIN DELETE FROM sync_journal WHERE tbl = 'settings' AND row_id = NEW.id; INSERT INTO sync_journal(tbl, row_id) VALUES ('settings', NEW.id); END;
CREATE TRIGGER IF NOT EXISTS sj_history_i AFTER INSERT ON history BEGIN DELETE FROM sync_journal WHERE tbl = 'history' AND row_id = NEW.id; INSERT INTO sync_journal(tbl, row_id) VALUES ('history', NEW.id); END;
CREATE TRIGGER IF NOT EXISTS sj_history_u AFTER UPDATE ON history BEGIN DELETE FROM sync_journal WHERE tbl = 'history' AND row_id = NEW.id; INSERT INTO sync_journal(tbl, row_id) VALUES ('history', NEW.id); END;
CREATE TRIGGER IF NOT EXISTS sj_saved_i AFTER INSERT ON saved_articles BEGIN DELETE FROM sync_journal WHERE tbl = 'saved_articles' AND row_id = NEW.id; INSERT INTO sync_journal(tbl, row_id) VALUES ('saved_articles', NEW.id); END;
CREATE TRIGGER IF NOT EXISTS sj_saved_u AFTER UPDATE ON saved_articles BEGIN DELETE FROM sync_journal WHERE tbl = 'saved_articles' AND row_id = NEW.id; INSERT INTO sync_journal(tbl, row_id) VALUES ('saved_articles', NEW.id); END;
CREATE TRIGGER IF NOT EXISTS sj_analyses_i AFTER INSERT ON analyses BEGIN DELETE FROM sync_journal WHERE tbl = 'analyses' AND row_id = NEW.id; INSERT INTO sync_journal(tbl, row_id) VALUES ('analyses', NEW.id); END;
CREATE TRIGGER IF NOT EXISTS sj_analyses_u AFTER UPDATE ON analyses BEGIN DELETE FROM sync_journal WHERE tbl = 'analyses' AND row_id = NEW.id; INSERT INTO sync_journal(tbl, row_id) VALUES ('analyses', NEW.id); END;
CREATE TRIGGER IF NOT EXISTS sj_topics_i AFTER INSERT ON topics BEGIN DELETE FROM sync_journal WHERE tbl = 'topics' AND row_id = NEW.id; INSERT INTO sync_journal(tbl, row_id) VALUES ('topics', NEW.id); END;
CREATE TRIGGER IF NOT EXISTS sj_topics_u AFTER UPDATE ON topics BEGIN DELETE FROM sync_journal WHERE tbl = 'topics' AND row_id = NEW.id; INSERT INTO sync_journal(tbl, row_id) VALUES ('topics', NEW.id); END;
CREATE TRIGGER IF NOT EXISTS sj_watches_i AFTER INSERT ON watches BEGIN DELETE FROM sync_journal WHERE tbl = 'watches' AND row_id = NEW.id; INSERT INTO sync_journal(tbl, row_id) VALUES ('watches', NEW.id); END;
CREATE TRIGGER IF NOT EXISTS sj_watches_u AFTER UPDATE ON watches BEGIN DELETE FROM sync_journal WHERE tbl = 'watches' AND row_id = NEW.id; INSERT INTO sync_journal(tbl, row_id) VALUES ('watches', NEW.id); END;
CREATE TRIGGER IF NOT EXISTS sj_custom_i AFTER INSERT ON custom_outlets BEGIN DELETE FROM sync_journal WHERE tbl = 'custom_outlets' AND row_id = NEW.id; INSERT INTO sync_journal(tbl, row_id) VALUES ('custom_outlets', NEW.id); END;
CREATE TRIGGER IF NOT EXISTS sj_custom_u AFTER UPDATE ON custom_outlets BEGIN DELETE FROM sync_journal WHERE tbl = 'custom_outlets' AND row_id = NEW.id; INSERT INTO sync_journal(tbl, row_id) VALUES ('custom_outlets', NEW.id); END;
CREATE TRIGGER IF NOT EXISTS sj_overrides_i AFTER INSERT ON outlet_overrides BEGIN DELETE FROM sync_journal WHERE tbl = 'outlet_overrides' AND row_id = NEW.id; INSERT INTO sync_journal(tbl, row_id) VALUES ('outlet_overrides', NEW.id); END;
CREATE TRIGGER IF NOT EXISTS sj_overrides_u AFTER UPDATE ON outlet_overrides BEGIN DELETE FROM sync_journal WHERE tbl = 'outlet_overrides' AND row_id = NEW.id; INSERT INTO sync_journal(tbl, row_id) VALUES ('outlet_overrides', NEW.id); END;
-- Las filas ya existentes entran en el diario una vez.
INSERT OR IGNORE INTO sync_journal(tbl, row_id) SELECT 'settings', id FROM settings;
INSERT OR IGNORE INTO sync_journal(tbl, row_id) SELECT 'history', id FROM history;
INSERT OR IGNORE INTO sync_journal(tbl, row_id) SELECT 'saved_articles', id FROM saved_articles;
INSERT OR IGNORE INTO sync_journal(tbl, row_id) SELECT 'analyses', id FROM analyses;
INSERT OR IGNORE INTO sync_journal(tbl, row_id) SELECT 'topics', id FROM topics;
INSERT OR IGNORE INTO sync_journal(tbl, row_id) SELECT 'watches', id FROM watches;
INSERT OR IGNORE INTO sync_journal(tbl, row_id) SELECT 'custom_outlets', id FROM custom_outlets;
INSERT OR IGNORE INTO sync_journal(tbl, row_id) SELECT 'outlet_overrides', id FROM outlet_overrides;
