import type Database from 'better-sqlite3';

type MetaRow = { value: string };

export function readMeta(db: Database.Database, key: string): string | null {
  const exists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='meta'")
    .get();
  if (!exists) return null;
  const row = db.prepare<[string], MetaRow>('SELECT value FROM meta WHERE key = ?').get(key);
  return row?.value ?? null;
}

export function writeMeta(db: Database.Database, key: string, value: string): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO meta (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(key, value, now);
}

export function deleteMeta(db: Database.Database, key: string): void {
  db.prepare('DELETE FROM meta WHERE key = ?').run(key);
}
