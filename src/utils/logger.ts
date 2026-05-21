import { appendFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { bootstrapLogPath, toolsLogPath } from '../paths.js';
import { ensureDir } from './files.js';

const MAX_INPUT_PREVIEW = 400;

function truncate(value: unknown, max = MAX_INPUT_PREVIEW): unknown {
  if (typeof value === 'string') {
    return value.length > max ? `${value.slice(0, max)}…[+${value.length - max}]` : value;
  }
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => truncate(v, max));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = truncate(v, max);
    }
    return out;
  }
  return value;
}

type ToolLogEntry = {
  timestamp: string;
  tool: string;
  input?: unknown;
  output_summary?: unknown;
  duration_ms: number;
  error?: { code?: string; message: string };
};

function appendLine(path: string, line: string): void {
  try {
    ensureDir(dirname(path));
    appendFileSync(path, `${line}\n`, 'utf8');
  } catch {
    // logging never throws into the caller
  }
}

export function logToolCall(entry: ToolLogEntry): void {
  const safe = {
    ...entry,
    input: entry.input !== undefined ? truncate(entry.input) : undefined,
    output_summary: entry.output_summary !== undefined ? truncate(entry.output_summary) : undefined,
  };
  appendLine(toolsLogPath(), JSON.stringify(safe));
}

export function logBootstrap(message: string, details?: Record<string, unknown>): void {
  appendLine(
    bootstrapLogPath(),
    JSON.stringify({ timestamp: new Date().toISOString(), message, details }),
  );
}
