import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, beforeEach } from 'vitest';
import { resetDbForTests } from '../src/db/client.js';

let currentTmpHome: string | null = null;

export function tempHome(): string {
  if (!currentTmpHome) throw new Error('tempHome called outside an active test scope');
  return currentTmpHome;
}

export function useFreshFocusHome(): void {
  beforeEach(() => {
    resetDbForTests();
    currentTmpHome = mkdtempSync(resolve(tmpdir(), 'focus-test-'));
    process.env.FOCUS_HOME = currentTmpHome;
  });

  afterEach(() => {
    resetDbForTests();
    if (currentTmpHome) {
      try {
        rmSync(currentTmpHome, { recursive: true, force: true });
      } catch {
        // best effort
      }
    }
    currentTmpHome = null;
    Reflect.deleteProperty(process.env, 'FOCUS_HOME');
  });
}
