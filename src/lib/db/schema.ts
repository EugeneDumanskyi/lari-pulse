export const schemaSql = `
CREATE TABLE IF NOT EXISTS symbols (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL UNIQUE,
  asset_type TEXT NOT NULL,
  base_asset TEXT NOT NULL,
  quote_asset TEXT NOT NULL,
  source TEXT NOT NULL,
  display_name TEXT,
  provider_symbol TEXT,
  price_unit TEXT,
  metadata_json TEXT,
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

CREATE TABLE IF NOT EXISTS widget_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  widget_id TEXT NOT NULL UNIQUE,
  is_enabled INTEGER NOT NULL CHECK (is_enabled IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS liquidation_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  symbol TEXT NOT NULL,
  source TEXT NOT NULL,
  event_time INTEGER NOT NULL,
  liquidation_side TEXT NOT NULL CHECK (liquidation_side IN ('long', 'short')),
  order_side TEXT NOT NULL,
  price REAL NOT NULL,
  quantity REAL NOT NULL,
  notional_usd REAL NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS derivatives_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  period TEXT NOT NULL,
  source TEXT NOT NULL,
  metric_time INTEGER NOT NULL,
  funding_rate REAL,
  next_funding_time INTEGER,
  mark_price REAL,
  index_price REAL,
  open_interest REAL,
  open_interest_value REAL,
  long_short_ratio REAL,
  long_account REAL,
  short_account REAL,
  basis REAL,
  basis_rate REAL,
  annualized_basis_rate REAL,
  futures_price REAL,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(symbol, period, source, metric_time)
);

CREATE TABLE IF NOT EXISTS situation_overviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  access_plan TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  bias TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  confidence TEXT NOT NULL,
  score REAL NOT NULL,
  risk_score REAL NOT NULL,
  main_drivers_json TEXT NOT NULL,
  conflicting_signals_json TEXT NOT NULL,
  watch_conditions_json TEXT NOT NULL,
  data_warnings_json TEXT NOT NULL,
  changes_json TEXT NOT NULL,
  source_widgets_json TEXT NOT NULL,
  meta_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS alert_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_type TEXT NOT NULL CHECK (rule_type IN (
    'situation_bias_changed',
    'risk_level_changed',
    'watch_condition_appeared',
    'widget_direction_changed',
    'score_crossed_threshold'
  )),
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  access_plan TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  is_enabled INTEGER NOT NULL CHECK (is_enabled IN (0, 1)) DEFAULT 1,
  widget_id TEXT,
  watch_condition_id TEXT,
  threshold_value REAL,
  threshold_direction TEXT CHECK (threshold_direction IN ('above', 'below') OR threshold_direction IS NULL),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS alert_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id INTEGER NOT NULL,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  access_plan TEXT NOT NULL,
  trigger_key TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  explanation TEXT NOT NULL,
  source_widget TEXT,
  overview_id INTEGER,
  metadata_json TEXT NOT NULL,
  acknowledged_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (rule_id) REFERENCES alert_rules(id) ON DELETE CASCADE,
  FOREIGN KEY (overview_id) REFERENCES situation_overviews(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS portfolio_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 0,
  average_cost REAL,
  quote_currency TEXT NOT NULL DEFAULT 'USDT',
  label TEXT,
  notes TEXT,
  include_in_risk INTEGER NOT NULL CHECK (include_in_risk IN (0, 1)) DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_candles_symbol_timeframe_open_time
  ON candles(symbol, timeframe, open_time);

CREATE INDEX IF NOT EXISTS idx_widget_results_widget_symbol_timeframe_created
  ON widget_results(widget_id, symbol, timeframe, created_at);

CREATE INDEX IF NOT EXISTS idx_widget_results_symbol_timeframe_created
  ON widget_results(symbol, timeframe, created_at);

CREATE INDEX IF NOT EXISTS idx_source_runs_source_collector_started
  ON source_runs(source, collector_id, started_at);

CREATE INDEX IF NOT EXISTS idx_symbols_asset_type_source
  ON symbols(asset_type, source);

CREATE INDEX IF NOT EXISTS idx_widget_settings_enabled
  ON widget_settings(is_enabled);

CREATE INDEX IF NOT EXISTS idx_liquidation_events_symbol_time
  ON liquidation_events(symbol, event_time);

CREATE INDEX IF NOT EXISTS idx_liquidation_events_source_time
  ON liquidation_events(source, event_time);

CREATE INDEX IF NOT EXISTS idx_derivatives_metrics_symbol_period_time
  ON derivatives_metrics(symbol, period, metric_time);

CREATE INDEX IF NOT EXISTS idx_derivatives_metrics_source_time
  ON derivatives_metrics(source, metric_time);

CREATE INDEX IF NOT EXISTS idx_situation_overviews_symbol_timeframe_plan_generated
  ON situation_overviews(symbol, timeframe, access_plan, generated_at);

CREATE INDEX IF NOT EXISTS idx_situation_overviews_symbol_timeframe_generated
  ON situation_overviews(symbol, timeframe, generated_at);

CREATE INDEX IF NOT EXISTS idx_alert_rules_plan_symbol_timeframe_enabled
  ON alert_rules(access_plan, symbol, timeframe, is_enabled);

CREATE INDEX IF NOT EXISTS idx_alert_events_plan_ack_created
  ON alert_events(access_plan, acknowledged_at, created_at);

CREATE INDEX IF NOT EXISTS idx_alert_events_rule_trigger_ack
  ON alert_events(rule_id, symbol, timeframe, trigger_key, acknowledged_at);

CREATE INDEX IF NOT EXISTS idx_portfolio_items_symbol_risk
  ON portfolio_items(symbol, include_in_risk);
`;
