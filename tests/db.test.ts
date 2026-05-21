import { describe, expect, it } from 'vitest';
import { getDb } from '../src/db/client.js';
import { readMeta, writeMeta } from '../src/db/meta.js';
import { runMigrations } from '../src/db/migrations.js';
import { CURRENT_SCHEMA_VERSION } from '../src/db/schema.js';
import { useFreshFocusHome } from './_helpers.js';

describe('db', () => {
  useFreshFocusHome();

  it('creates schema and writes schema_version meta', () => {
    const db = getDb();
    expect(readMeta(db, 'schema_version')).toBe(String(CURRENT_SCHEMA_VERSION));
  });

  it('is idempotent when migrations re-run', () => {
    const db = getDb();
    runMigrations(db);
    runMigrations(db);
    expect(readMeta(db, 'schema_version')).toBe(String(CURRENT_SCHEMA_VERSION));
  });

  it('rejects a newer schema version than supported', () => {
    const db = getDb();
    writeMeta(db, 'schema_version', String(CURRENT_SCHEMA_VERSION + 1));
    expect(() => runMigrations(db)).toThrow(/newer than supported/);
  });

  it('creates the indices on todo_items', () => {
    const db = getDb();
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='todo_items'")
      .all() as Array<{ name: string }>;
    const names = rows.map((r) => r.name);
    expect(names).toContain('idx_status');
    expect(names).toContain('idx_rank');
  });
});
