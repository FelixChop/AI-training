import type Database from 'better-sqlite3';
import { FocusError } from '../models/status.js';
import { readMeta, writeMeta } from './meta.js';
import { CURRENT_SCHEMA_VERSION, createInitialSchema } from './schema.js';

type Migration = {
  version: number;
  up: (db: Database.Database) => void;
};

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    up: (db) => {
      createInitialSchema(db);
    },
  },
  {
    version: 2,
    // v2 adds the scan_progress_json meta key used by get_scan_plan /
    // update_scan_progress / resume_bootstrap. No table change needed — the
    // value lives in the existing meta k/v store. This migration only bumps
    // the schema_version so older installs know about the new key.
    up: () => {},
  },
];

export function runMigrations(db: Database.Database): void {
  const currentRaw = readMeta(db, 'schema_version');
  const current = currentRaw ? Number.parseInt(currentRaw, 10) : 0;
  if (Number.isNaN(current)) {
    throw new FocusError('MIGRATION_REQUIRED', `Invalid schema_version in meta: "${currentRaw}".`);
  }

  if (current === CURRENT_SCHEMA_VERSION) return;
  if (current > CURRENT_SCHEMA_VERSION) {
    throw new FocusError(
      'MIGRATION_REQUIRED',
      `Database schema_version ${current} is newer than supported ${CURRENT_SCHEMA_VERSION}. Upgrade focus.`,
    );
  }

  const pending = MIGRATIONS.filter((m) => m.version > current).sort(
    (a, b) => a.version - b.version,
  );

  const run = db.transaction(() => {
    for (const migration of pending) {
      try {
        migration.up(db);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new FocusError(
          'MIGRATION_REQUIRED',
          `Migration to v${migration.version} failed: ${message}`,
        );
      }
    }
    writeMeta(db, 'schema_version', String(CURRENT_SCHEMA_VERSION));
  });

  run();
}
