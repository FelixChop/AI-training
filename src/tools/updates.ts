import { z } from 'zod';
import { getDb } from '../db/client.js';
import { readMeta, writeMeta } from '../db/meta.js';
import { VERSION } from '../version.js';

export const checkForUpdatesSchema = z.object({}).strict();
export type CheckForUpdatesInput = z.infer<typeof checkForUpdatesSchema>;

export type CheckForUpdatesOutput = {
  current_version: string;
  latest_version: string | null;
  update_available: boolean;
  changelog?: string;
  update_command?: string;
};

const RELEASES_URL = 'https://api.github.com/repos/felixchop/focus/releases/latest';
const CACHE_TTL_MS = 60 * 60 * 1000;

function compareSemver(a: string, b: string): number {
  const norm = (s: string) => s.replace(/^v/, '');
  const pa = norm(a)
    .split('.')
    .map((p) => Number.parseInt(p, 10));
  const pb = norm(b)
    .split('.')
    .map((p) => Number.parseInt(p, 10));
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (Number.isNaN(x) || Number.isNaN(y)) return 0;
    if (x !== y) return x - y;
  }
  return 0;
}

type CachedPayload = {
  cached_at: number;
  output: CheckForUpdatesOutput;
};

async function fetchLatest(timeoutMs = 5000): Promise<CheckForUpdatesOutput> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(RELEASES_URL, {
      signal: controller.signal,
      headers: { 'User-Agent': `focus-mcp/${VERSION}`, Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) {
      return { current_version: VERSION, latest_version: null, update_available: false };
    }
    const data = (await res.json()) as { tag_name?: string; body?: string };
    const latest = data.tag_name ?? null;
    const updateAvailable = latest ? compareSemver(latest, VERSION) > 0 : false;
    const output: CheckForUpdatesOutput = {
      current_version: VERSION,
      latest_version: latest,
      update_available: updateAvailable,
    };
    if (data.body) output.changelog = data.body;
    if (updateAvailable) {
      output.update_command = 'npm install -g @felixchop/focus@latest';
    }
    return output;
  } catch {
    return { current_version: VERSION, latest_version: null, update_available: false };
  } finally {
    clearTimeout(timer);
  }
}

export async function checkForUpdatesTool(): Promise<CheckForUpdatesOutput> {
  const db = getDb();
  const cachedRaw = readMeta(db, 'update_check_cache');
  if (cachedRaw) {
    try {
      const parsed = JSON.parse(cachedRaw) as CachedPayload;
      if (Date.now() - parsed.cached_at < CACHE_TTL_MS) {
        return parsed.output;
      }
    } catch {
      // ignore cache errors
    }
  }
  const output = await fetchLatest();
  const payload: CachedPayload = { cached_at: Date.now(), output };
  writeMeta(db, 'update_check_cache', JSON.stringify(payload));
  return output;
}
