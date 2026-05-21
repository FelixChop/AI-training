import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import matter from 'gray-matter';
import type { ReferenceContent, ReferenceFrontmatter } from '../models/reference.js';
import { FocusError } from '../models/status.js';

export function ensureDir(path: string): void {
  try {
    mkdirSync(path, { recursive: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new FocusError('IO_ERROR', `Could not create directory ${path}: ${message}`);
  }
}

export function readMarkdownFile(absolutePath: string): ReferenceContent {
  let raw: string;
  try {
    raw = readFileSync(absolutePath, 'utf8');
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') {
      throw new FocusError('NOT_FOUND', `Reference file not found: ${absolutePath}`);
    }
    throw new FocusError('IO_ERROR', `Could not read ${absolutePath}: ${e.message}`);
  }
  const parsed = matter(raw);
  return {
    path: absolutePath,
    frontmatter: (parsed.data ?? {}) as ReferenceFrontmatter,
    body: parsed.content,
    raw,
  };
}

export function writeMarkdownAtomic(absolutePath: string, content: string): void {
  ensureDir(dirname(absolutePath));
  const tmp = `${absolutePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(tmp, content, 'utf8');
    renameSync(tmp, absolutePath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new FocusError('IO_ERROR', `Could not write ${absolutePath}: ${message}`);
  }
}

export function fileExists(absolutePath: string): boolean {
  try {
    statSync(absolutePath);
    return true;
  } catch {
    return false;
  }
}

export function getMtime(absolutePath: string): string {
  try {
    return statSync(absolutePath).mtime.toISOString();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new FocusError('IO_ERROR', `Could not stat ${absolutePath}: ${message}`);
  }
}
