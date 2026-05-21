import { writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import lockfile from 'proper-lockfile';
import { FocusError } from '../models/status.js';
import { ensureDir } from './files.js';

export async function withFileLock<T>(absolutePath: string, fn: () => Promise<T> | T): Promise<T> {
  ensureDir(dirname(absolutePath));
  // proper-lockfile requires the target to exist. Create an empty marker if missing.
  try {
    writeFileSync(absolutePath, '', { flag: 'a' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new FocusError('IO_ERROR', `Could not prepare lock target ${absolutePath}: ${message}`);
  }
  let release: () => Promise<void>;
  try {
    release = await lockfile.lock(absolutePath, {
      retries: { retries: 5, minTimeout: 50, maxTimeout: 250 },
      stale: 10_000,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new FocusError('IO_ERROR', `Could not acquire lock on ${absolutePath}: ${message}`);
  }
  try {
    return await fn();
  } finally {
    try {
      await release();
    } catch {
      // best effort
    }
  }
}
