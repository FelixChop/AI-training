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
