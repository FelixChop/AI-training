import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { FocusError } from '../models/status.js';
import { dbPath } from '../paths.js';
import { runMigrations } from './migrations.js';

let cached: Database.Database | null = null;

export function getDb(): Database.Database {
  if (cached) return cached;
  const path = dbPath();
  try {
    mkdirSync(dirname(path), { recursive: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new FocusError('IO_ERROR', `Could not create focus home: ${message}`);
  }
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  cached = db;
  return db;
}

export function closeDb(): void {
  if (cached) {
    cached.close();
    cached = null;
  }
}

/**
 * Reset the cached database connection. Used by tests that re-point ~/.focus/.
 */
export function resetDbForTests(): void {
  closeDb();
}
