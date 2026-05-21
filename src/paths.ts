import { homedir } from 'node:os';
import { resolve, sep } from 'node:path';
import { FocusError } from './models/status.js';

const FOCUS_HOME_ENV = 'FOCUS_HOME';

export function focusHome(): string {
  const override = process.env[FOCUS_HOME_ENV];
  if (override && override.trim().length > 0) {
    return resolve(override);
  }
  return resolve(homedir(), '.focus');
}

export function dbPath(): string {
  return resolve(focusHome(), 'focus.db');
}

export function metaJsonPath(): string {
  return resolve(focusHome(), 'meta.json');
}

export function referenceDir(): string {
  return resolve(focusHome(), 'reference');
}

export function stakeholdersDir(): string {
  return resolve(referenceDir(), 'stakeholders');
}

export function projectsDir(): string {
  return resolve(referenceDir(), 'projects');
}

export function logsDir(): string {
  return resolve(focusHome(), 'logs');
}

export function toolsLogPath(): string {
  return resolve(logsDir(), 'tools.log');
}

export function bootstrapLogPath(): string {
  return resolve(logsDir(), 'bootstrap.log');
}

/**
 * Resolve a user-supplied relative path under ~/.focus/reference/ and refuse
 * anything that escapes the reference dir (traversal, absolute paths, symlinks
 * outside the home).
 */
export function resolveReferencePath(relative: string): string {
  if (typeof relative !== 'string' || relative.length === 0) {
    throw new FocusError('INVALID_INPUT', 'Reference path must be a non-empty string.');
  }
  if (relative.includes('\0')) {
    throw new FocusError('INVALID_INPUT', 'Reference path contains an invalid character.');
  }
  const base = referenceDir();
  const candidate = resolve(base, relative);
  const baseWithSep = base.endsWith(sep) ? base : base + sep;
  if (candidate !== base && !candidate.startsWith(baseWithSep)) {
    throw new FocusError(
      'INVALID_INPUT',
      `Reference path "${relative}" escapes ~/.focus/reference/.`,
    );
  }
  return candidate;
}

/**
 * Return the relative path from ~/.focus/reference/ for an absolute resolved
 * reference path. Useful to roundtrip a path back into list_references output.
 */
export function relativeReferencePath(absolute: string): string {
  const base = referenceDir();
  const baseWithSep = base.endsWith(sep) ? base : base + sep;
  if (absolute === base) return '';
  if (!absolute.startsWith(baseWithSep)) {
    throw new FocusError('INVALID_INPUT', `Path "${absolute}" is not under the reference dir.`);
  }
  return absolute.slice(baseWithSep.length).split(sep).join('/');
}
