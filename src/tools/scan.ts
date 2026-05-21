import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { readMeta, writeMeta } from '../db/meta.js';
import {
  SCAN_PROGRESS_META_KEY,
  type ScanPhase,
  type ScanProgress,
  computeProgressPercent,
  findNextPhase,
  parseScanProgress,
  serializeScanProgress,
} from '../models/scan.js';
import { FocusError } from '../models/status.js';
import { completeBootstrap } from './bootstrap.js';

export const getScanPlanSchema = z
  .object({
    scan_depth_months: z
      .number()
      .int()
      .refine((n) => n === -1 || (n >= 1 && n <= 24), {
        message: 'scan_depth_months must be -1 or between 1 and 24.',
      }),
  })
  .strict();

export type GetScanPlanInput = z.infer<typeof getScanPlanSchema>;

export type GetScanPlanOutput = {
  plan_id: string;
  scan_depth_months: number;
  phases: ScanPhase[];
  current_phase_id: string | null;
  completed_phase_ids: string[];
  progress_percent: number;
  resumed: boolean;
};

function isoMonthsAgo(months: number, now: Date = new Date()): string {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

function buildCanonicalPhases(scanDepthMonths: number): ScanPhase[] {
  const after = scanDepthMonths === -1 ? null : isoMonthsAgo(scanDepthMonths);
  const sentQuery = after ? `from:me after:${after}` : 'from:me';
  const receivedQuery = after ? `to:me after:${after}` : 'to:me';
  return [
    {
      id: 'p1',
      name: 'sent_emails_scan',
      tool_hint: 'email MCP search/list (e.g. gmail.search_emails, outlook.list_messages)',
      params_hint: { query: sentQuery, max_results: 500 },
      goal: "Fetch the user's outgoing messages for the requested period.",
      expected_outputs: ['sent_message_corpus'],
      batch_size_hint: 100,
      depends_on: [],
    },
    {
      id: 'p2',
      name: 'received_emails_scan',
      tool_hint: 'email MCP search/list (e.g. gmail.search_emails, outlook.list_messages)',
      params_hint: { query: receivedQuery, max_results: 500 },
      goal: 'Fetch incoming messages to identify recurring contacts and open loops.',
      expected_outputs: ['received_message_corpus'],
      batch_size_hint: 100,
      depends_on: [],
    },
    {
      id: 'p3',
      name: 'stakeholder_extraction',
      tool_hint: 'focus.suggest_reference_update',
      params_hint: { path: 'stakeholders/<slug>.md', content: '<markdown>' },
      goal: 'Build one stakeholder card per recurring contact (>= 3 interactions).',
      expected_outputs: ['stakeholder_cards'],
      batch_size_hint: 25,
      depends_on: ['p1', 'p2'],
    },
    {
      id: 'p4',
      name: 'style_guide_build',
      tool_hint: 'focus.suggest_reference_update',
      params_hint: { path: 'style_guide.md', content: '<markdown>' },
      goal: 'Capture 20-30 verbatim outgoing messages and extract style rules.',
      expected_outputs: ['style_guide.md'],
      batch_size_hint: 30,
      depends_on: ['p1'],
    },
    {
      id: 'p5',
      name: 'project_clustering',
      tool_hint: 'focus.suggest_reference_update',
      params_hint: { path: 'projects/<slug>.md', content: '<markdown>' },
      goal: 'Cluster threads into projects and create project cards.',
      expected_outputs: ['project_cards'],
      batch_size_hint: 10,
      depends_on: ['p1', 'p2', 'p3'],
    },
    {
      id: 'p6',
      name: 'orgchart_build',
      tool_hint: 'focus.suggest_reference_update',
      params_hint: { path: 'orgchart.md', content: '<markdown>' },
      goal: "Synthesise an org chart from the user's internal communication patterns.",
      expected_outputs: ['orgchart.md'],
      batch_size_hint: 1,
      depends_on: ['p3'],
    },
    {
      id: 'p7',
      name: 'initial_todo_generation',
      tool_hint: 'focus.save_todo',
      params_hint: { items: '<TodoItem[]>', merge_mode: 'upsert' },
      goal: 'Detect open loops over the last 2 weeks and persist 5-20 ranked todo items.',
      expected_outputs: ['initial_todo'],
      batch_size_hint: 20,
      depends_on: ['p1', 'p2', 'p3', 'p5'],
    },
  ];
}

function loadProgress(): ScanProgress | null {
  return parseScanProgress(readMeta(getDb(), SCAN_PROGRESS_META_KEY));
}

function saveProgress(progress: ScanProgress): void {
  writeMeta(getDb(), SCAN_PROGRESS_META_KEY, serializeScanProgress(progress));
}

export function getScanPlanTool(input: GetScanPlanInput): GetScanPlanOutput {
  const parsed = getScanPlanSchema.parse(input);
  const existing = loadProgress();
  if (existing) {
    return {
      plan_id: existing.plan_id,
      scan_depth_months: existing.scan_depth_months,
      phases: existing.phases,
      current_phase_id: existing.current_phase_id,
      completed_phase_ids: existing.completed_phase_ids,
      progress_percent: computeProgressPercent(existing),
      resumed: true,
    };
  }

  const phases = buildCanonicalPhases(parsed.scan_depth_months);
  const now = new Date().toISOString();
  const progress: ScanProgress = {
    plan_id: randomUUID(),
    scan_depth_months: parsed.scan_depth_months,
    started_at: now,
    phases,
    completed_phase_ids: [],
    current_phase_id: phases[0]?.id ?? null,
    items_processed: 0,
    last_update_at: now,
  };
  saveProgress(progress);

  return {
    plan_id: progress.plan_id,
    scan_depth_months: progress.scan_depth_months,
    phases: progress.phases,
    current_phase_id: progress.current_phase_id,
    completed_phase_ids: [],
    progress_percent: 0,
    resumed: false,
  };
}

export const updateScanProgressSchema = z
  .object({
    phase_id: z.string().min(1),
    items_processed_delta: z.number().int().nonnegative().optional(),
    mark_complete: z.boolean().optional(),
  })
  .strict();

export type UpdateScanProgressInput = z.infer<typeof updateScanProgressSchema>;

export type UpdateScanProgressOutput = {
  updated: true;
  current_phase_id: string | null;
  next_phase: ScanPhase | null;
  items_processed: number;
  progress_percent: number;
  bootstrap_completed: boolean;
};

export function updateScanProgressTool(input: UpdateScanProgressInput): UpdateScanProgressOutput {
  const parsed = updateScanProgressSchema.parse(input);
  const progress = loadProgress();
  if (!progress) {
    throw new FocusError(
      'NOT_FOUND',
      'No scan plan in progress. Call get_scan_plan first (typically via bootstrap).',
    );
  }
  const phase = progress.phases.find((p) => p.id === parsed.phase_id);
  if (!phase) {
    throw new FocusError(
      'INVALID_INPUT',
      `Phase id "${parsed.phase_id}" is not part of the current scan plan.`,
    );
  }

  if (parsed.items_processed_delta && parsed.items_processed_delta > 0) {
    progress.items_processed += parsed.items_processed_delta;
  }

  let bootstrapCompleted = false;
  if (parsed.mark_complete) {
    if (!progress.completed_phase_ids.includes(phase.id)) {
      progress.completed_phase_ids.push(phase.id);
    }
    const next = findNextPhase(progress);
    progress.current_phase_id = next?.id ?? null;
    if (next === null) {
      bootstrapCompleted = true;
    }
  }

  progress.last_update_at = new Date().toISOString();
  saveProgress(progress);

  if (bootstrapCompleted) {
    completeBootstrap();
  }

  return {
    updated: true,
    current_phase_id: progress.current_phase_id,
    next_phase: findNextPhase(progress),
    items_processed: progress.items_processed,
    progress_percent: computeProgressPercent(progress),
    bootstrap_completed: bootstrapCompleted,
  };
}

export const resumeBootstrapSchema = z.object({}).strict();
export type ResumeBootstrapInput = z.infer<typeof resumeBootstrapSchema>;

export type ResumeBootstrapOutput =
  | {
      status: 'no_resume_needed';
      reason: string;
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

function resumeInstructions(progress: ScanProgress): string {
  const next = findNextPhase(progress);
  if (!next) {
    return 'All phases are complete. Mark the bootstrap as done if it was not already.';
  }
  const doneList = progress.completed_phase_ids.length
    ? progress.completed_phase_ids.join(', ')
    : '(none)';
  return [
    `Resume the bootstrap at phase ${next.id} (${next.name}).`,
    `Completed phases: ${doneList}.`,
    `Items processed so far: ${progress.items_processed}.`,
    `Goal of next phase: ${next.goal}`,
    `Tool hint: ${next.tool_hint}.`,
    `Params hint: ${JSON.stringify(next.params_hint)}.`,
    `Batch size hint: ${next.batch_size_hint}.`,
    'Report progress with update_scan_progress after each batch, and mark_complete at the end.',
  ].join('\n');
}

export function resumeBootstrapTool(_input: ResumeBootstrapInput = {}): ResumeBootstrapOutput {
  const progress = loadProgress();
  if (!progress) {
    return {
      status: 'no_resume_needed',
      reason: 'No scan plan is in progress. Call bootstrap to start one.',
    };
  }
  const next = findNextPhase(progress);
  return {
    status: 'resume',
    plan_id: progress.plan_id,
    scan_depth_months: progress.scan_depth_months,
    current_phase: next,
    completed_phase_ids: progress.completed_phase_ids,
    items_processed: progress.items_processed,
    progress_percent: computeProgressPercent(progress),
    instructions: resumeInstructions(progress),
  };
}

export function loadScanProgress(): ScanProgress | null {
  return loadProgress();
}

export function clearScanProgressForTests(): void {
  writeMeta(getDb(), SCAN_PROGRESS_META_KEY, '');
}
