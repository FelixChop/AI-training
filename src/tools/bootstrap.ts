import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { readMeta, writeMeta } from '../db/meta.js';
import { FocusError } from '../models/status.js';
import { focusHome, projectsDir, referenceDir, stakeholdersDir } from '../paths.js';
import { fileExists } from '../utils/files.js';
import { VERSION } from '../version.js';

export const bootstrapInputSchema = z
  .object({
    scan_depth_months: z
      .number()
      .int()
      .refine((n) => n === -1 || (n >= 1 && n <= 24), {
        message: 'scan_depth_months must be -1 or between 1 and 24.',
      }),
  })
  .strict();

export type BootstrapInput = z.infer<typeof bootstrapInputSchema>;

export type BootstrapOutput = {
  status: 'started';
  instructions_path: string;
  instructions: string;
  available_mcps_detected: string[];
  recommended_steps: string[];
};

const RECOMMENDED_STEPS = [
  'Scan emails for the requested period and extract recurring contacts (>= 3 interactions).',
  'Build a stakeholder card per recurring contact via suggest_reference_update.',
  "Capture 20-30 of the user's own messages verbatim into a draft style_guide.md.",
  'Cluster threads into projects and create projects/<slug>.md cards.',
  'Identify open loops in the last 2 weeks and persist them via save_todo.',
  'Present the first todo to the user, then mark bootstrap complete.',
];

function readInstructionsMarkdown(): string {
  // When running from /dist, src/instructions lives next to the package root.
  // Resolve relative to this module's URL and walk back to the package root.
  const here = fileURLToPath(new URL('.', import.meta.url));
  const candidates = [
    resolve(here, '..', 'instructions', 'bootstrap.md'),
    resolve(here, '..', '..', 'src', 'instructions', 'bootstrap.md'),
  ];
  for (const path of candidates) {
    if (fileExists(path)) {
      return readFileSync(path, 'utf8');
    }
  }
  throw new FocusError('IO_ERROR', 'Could not locate instructions/bootstrap.md');
}

function detectAvailableMcps(): string[] {
  const fromEnv = process.env.FOCUS_DETECTED_MCPS;
  if (!fromEnv) return [];
  return fromEnv
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function bootstrapTool(input: BootstrapInput): BootstrapOutput {
  const parsed = bootstrapInputSchema.parse(input);
  const db = getDb();
  writeMeta(db, 'bootstrap_status', 'in_progress');
  writeMeta(db, 'bootstrap_started_at', new Date().toISOString());
  writeMeta(db, 'bootstrap_scan_depth_months', String(parsed.scan_depth_months));

  return {
    status: 'started',
    instructions_path: 'src/instructions/bootstrap.md',
    instructions: readInstructionsMarkdown(),
    available_mcps_detected: detectAvailableMcps(),
    recommended_steps: RECOMMENDED_STEPS,
  };
}

export type StatusOutput = {
  bootstrap_status: 'not_started' | 'in_progress' | 'complete';
  last_bootstrap_at: string | null;
  todo_items_count: number;
  references: {
    stakeholders_count: number;
    projects_count: number;
    has_objectives: boolean;
    has_style_guide: boolean;
    has_orgchart: boolean;
  };
  version: string;
  meta_path: string;
};

function countMarkdownFiles(dir: string): number {
  try {
    return readdirSync(dir).filter((name) => name.endsWith('.md') && !name.endsWith('.pending.md'))
      .length;
  } catch {
    return 0;
  }
}

export function statusTool(): StatusOutput {
  const db = getDb();
  const status = (readMeta(db, 'bootstrap_status') ??
    'not_started') as StatusOutput['bootstrap_status'];
  const last = readMeta(db, 'last_bootstrap_at');
  const row = db.prepare('SELECT COUNT(*) AS n FROM todo_items WHERE status = ?').get('open') as
    | { n: number }
    | undefined;

  return {
    bootstrap_status: status,
    last_bootstrap_at: last,
    todo_items_count: row?.n ?? 0,
    references: {
      stakeholders_count: countMarkdownFiles(stakeholdersDir()),
      projects_count: countMarkdownFiles(projectsDir()),
      has_objectives: fileExists(resolve(referenceDir(), 'objectives.md')),
      has_style_guide: fileExists(resolve(referenceDir(), 'style_guide.md')),
      has_orgchart: fileExists(resolve(referenceDir(), 'orgchart.md')),
    },
    version: VERSION,
    meta_path: focusHome(),
  };
}

export function completeBootstrap(): { complete: true } {
  const db = getDb();
  const now = new Date().toISOString();
  writeMeta(db, 'bootstrap_status', 'complete');
  writeMeta(db, 'last_bootstrap_at', now);
  return { complete: true };
}
