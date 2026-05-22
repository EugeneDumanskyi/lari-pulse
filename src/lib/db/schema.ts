export const schemaSql = `
CREATE TABLE IF NOT EXISTS symbols (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL UNIQUE,
  asset_type TEXT NOT NULL,
  base_asset TEXT NOT NULL,
  quote_asset TEXT NOT NULL,
  source TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS candles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  open_time INTEGER NOT NULL,
  close_time INTEGER NOT NULL,
  open REAL NOT NULL,
  high REAL NOT NULL,
  low REAL NOT NULL,
  close REAL NOT NULL,
  volume REAL NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(symbol, timeframe, open_time, source)
);

CREATE TABLE IF NOT EXISTS widget_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  widget_id TEXT NOT NULL,
  symbol TEXT,
  timeframe TEXT,
  score REAL NOT NULL,
  direction TEXT NOT NULL,
  confidence REAL NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  summary TEXT NOT NULL,
  details_json TEXT NOT NULL,
  sources_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS source_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  collector_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failure')),
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  error_message TEXT,
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_candles_symbol_timeframe_open_time
  ON candles(symbol, timeframe, open_time);

CREATE INDEX IF NOT EXISTS idx_widget_results_widget_symbol_timeframe_created
  ON widget_results(widget_id, symbol, timeframe, created_at);

CREATE INDEX IF NOT EXISTS idx_widget_results_symbol_timeframe_created
  ON widget_results(symbol, timeframe, created_at);

CREATE INDEX IF NOT EXISTS idx_source_runs_source_collector_started
  ON source_runs(source, collector_id, started_at);
`;
