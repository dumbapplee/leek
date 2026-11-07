export const schemaSql = `
CREATE TABLE IF NOT EXISTS stock_versions (
  seller_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  size_id TEXT NOT NULL,
  country_code TEXT NOT NULL,
  applied_source_version INTEGER NOT NULL,
  PRIMARY KEY (seller_id, product_id, size_id, country_code)
);

CREATE TABLE IF NOT EXISTS import_jobs (
  job_id TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  csv_body TEXT NOT NULL DEFAULT '',
  total_rows INTEGER NOT NULL DEFAULT 0,
  succeeded_rows INTEGER NOT NULL DEFAULT 0,
  failed_rows INTEGER NOT NULL DEFAULT 0,
  skipped_rows INTEGER NOT NULL DEFAULT 0,
  created_at_ms INTEGER,
  updated_at_ms INTEGER
);

CREATE TABLE IF NOT EXISTS import_rows (
  job_id TEXT NOT NULL REFERENCES import_jobs (job_id),
  line_number INTEGER NOT NULL,
  outcome TEXT NOT NULL,
  reason TEXT,
  PRIMARY KEY (job_id, line_number)
);

CREATE TABLE IF NOT EXISTS outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  stock_key TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  published_at INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at_ms INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  dead_at_ms INTEGER
);

CREATE INDEX IF NOT EXISTS outbox_pending_stock_key ON outbox (stock_key, id)
  WHERE published_at IS NULL AND dead_at_ms IS NULL;

CREATE TABLE IF NOT EXISTS stock_leases (
  stock_key TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  expires_at_ms INTEGER NOT NULL
);
`;
