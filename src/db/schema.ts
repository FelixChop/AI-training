import type Database from 'better-sqlite3';

export const CURRENT_SCHEMA_VERSION = 1;

const CREATE_TODO_ITEMS = `
CREATE TABLE IF NOT EXISTS todo_items (
  id TEXT PRIMARY KEY,
  rank INTEGER NOT NULL,
  project TEXT NOT NULL,
  priority TEXT NOT NULL,
  context TEXT NOT NULL,
  sources_json TEXT NOT NULL,
  actions_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  claimed_by TEXT,
  locked_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);`;

const CREATE_META = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);`;

const CREATE_INDEX_STATUS = 'CREATE INDEX IF NOT EXISTS idx_status ON todo_items(status);';
const CREATE_INDEX_RANK = 'CREATE INDEX IF NOT EXISTS idx_rank ON todo_items(rank);';

export function createInitialSchema(db: Database.Database): void {
  db.exec(CREATE_META);
  db.exec(CREATE_TODO_ITEMS);
  db.exec(CREATE_INDEX_STATUS);
  db.exec(CREATE_INDEX_RANK);
}
