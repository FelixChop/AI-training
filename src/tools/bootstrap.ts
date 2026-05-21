import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { readMeta, writeMeta } from '../db/meta.js';
import {
  SCAN_PROGRESS_META_KEY,
  type ScanPhase,
  computeProgressPercent,
  findNextPhase,
  parseScanProgress,
} from '../models/scan.js';
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

export type BootstrapOutput =
  | {
      status: 'started';
      instructions_path: string;
      instructions: string;
      available_mcps_detected: string[];
      recommended_steps: string[];
      scan_plan_tool: 'get_scan_plan';
    }
  | {
      status: 'resume';
      plan_id: string;
      scan_depth_months: number;
      current_phase: ScanPhase | null;
      completed_phase_ids: string[];
      items_processed: number;
      progress_percent: number;
      instructions: string;
    };

const RECOMMENDED_STEPS = [
  'Call get_scan_plan(scan_depth_months) to receive the structured 7-phase plan.',
  'For each phase, execute its tool_hint with the suggested params and process results in batches of batch_size_hint.',
  'After every batch, call update_scan_progress({ phase_id, items_processed_delta }).',
  'When a phase is finished, call update_scan_progress({ phase_id, mark_complete: true }).',
  'If the session is interrupted, the next session calls resume_bootstrap() first to find out where to continue.',
  'When the last phase is marked complete, focus auto-sets bootstrap_status to "complete".',
];

function readInstructionsMarkdown(): string {
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

function buildResumePayload(): Extract<BootstrapOutput, { status: 'resume' }> | null {
  const db = getDb();
  const progress = parseScanProgress(readMeta(db, SCAN_PROGRESS_META_KEY));
  if (!progress) return null;
  const next = findNextPhase(progress);
  const doneList = progress.completed_phase_ids.length
    ? progress.completed_phase_ids.join(', ')
    : '(none)';
  const instructions = next
    ? [
        `Resume the bootstrap at phase ${next.id} (${next.name}).`,
        `Completed phases: ${doneList}.`,
        `Items processed so far: ${progress.items_processed}.`,
        `Goal of next phase: ${next.goal}`,
        `Tool hint: ${next.tool_hint}.`,
        `Params hint: ${JSON.stringify(next.params_hint)}.`,
        `Batch size hint: ${next.batch_size_hint}.`,
        'Report progress with update_scan_progress after each batch.',
      ].join('\n')
    : 'All phases are already complete. Call status to verify bootstrap_status.';
  return {
    status: 'resume',
    plan_id: progress.plan_id,
    scan_depth_months: progress.scan_depth_months,
    current_phase: next,
    completed_phase_ids: progress.completed_phase_ids,
    items_processed: progress.items_processed,
    progress_percent: computeProgressPercent(progress),
    instructions,
  };
}

export function bootstrapTool(input: BootstrapInput): BootstrapOutput {
  const parsed = bootstrapInputSchema.parse(input);
  const db = getDb();
  const currentStatus = readMeta(db, 'bootstrap_status');

  if (currentStatus === 'in_progress') {
    const resume = buildResumePayload();
    if (resume) return resume;
  }

  writeMeta(db, 'bootstrap_status', 'in_progress');
  writeMeta(db, 'bootstrap_started_at', new Date().toISOString());
  writeMeta(db, 'bootstrap_scan_depth_months', String(parsed.scan_depth_months));

  return {
    status: 'started',
    instructions_path: 'src/instructions/bootstrap.md',
    instructions: readInstructionsMarkdown(),
    available_mcps_detected: detectAvailableMcps(),
    recommended_steps: RECOMMENDED_STEPS,
    scan_plan_tool: 'get_scan_plan',
  };
}

export type ScanProgressSummary = {
  plan_id: string;
  current_phase_id: string | null;
  completed_phase_count: number;
  total_phase_count: number;
  items_processed: number;
  progress_percent: number;
  last_update_at: string;
};

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
  scan_progress: ScanProgressSummary | null;
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

function buildScanProgressSummary(): ScanProgressSummary | null {
  const db = getDb();
  const progress = parseScanProgress(readMeta(db, SCAN_PROGRESS_META_KEY));
  if (!progress) return null;
  return {
    plan_id: progress.plan_id,
    current_phase_id: progress.current_phase_id,
    completed_phase_count: progress.completed_phase_ids.length,
    total_phase_count: progress.phases.length,
    items_processed: progress.items_processed,
    progress_percent: computeProgressPercent(progress),
    last_update_at: progress.last_update_at,
  };
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
    scan_progress: buildScanProgressSummary(),
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
