-- Subproyecto 4: consumo mensual de IA (local, no se sincroniza).
CREATE TABLE usage (
  month          TEXT NOT NULL,
  provider       TEXT NOT NULL,
  model          TEXT NOT NULL,
  input_tokens   INTEGER NOT NULL DEFAULT 0,
  output_tokens  INTEGER NOT NULL DEFAULT 0,
  cost           REAL NOT NULL DEFAULT 0,
  requests       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (month, provider, model)
);
