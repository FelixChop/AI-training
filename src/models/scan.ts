import { z } from 'zod';

export const scanPhaseSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    tool_hint: z.string(),
    params_hint: z.record(z.unknown()),
    goal: z.string(),
    expected_outputs: z.array(z.string()),
    batch_size_hint: z.number().int().positive(),
    depends_on: z.array(z.string()),
  })
  .strict();

export type ScanPhase = z.infer<typeof scanPhaseSchema>;

export const scanProgressSchema = z
  .object({
    plan_id: z.string(),
    scan_depth_months: z.number().int(),
    started_at: z.string(),
    phases: z.array(scanPhaseSchema),
    completed_phase_ids: z.array(z.string()),
    current_phase_id: z.string().nullable(),
    items_processed: z.number().int().nonnegative(),
    last_update_at: z.string(),
  })
  .strict();

export type ScanProgress = z.infer<typeof scanProgressSchema>;

export const SCAN_PROGRESS_META_KEY = 'scan_progress_json';

export function serializeScanProgress(progress: ScanProgress): string {
  return JSON.stringify(progress);
}

export function parseScanProgress(raw: string | null): ScanProgress | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    return scanProgressSchema.parse(obj);
  } catch {
    return null;
  }
}

export function findNextPhase(progress: ScanProgress): ScanPhase | null {
  const completed = new Set(progress.completed_phase_ids);
  for (const phase of progress.phases) {
    if (completed.has(phase.id)) continue;
    const depsSatisfied = phase.depends_on.every((d) => completed.has(d));
    if (depsSatisfied) return phase;
  }
  return null;
}

export function computeProgressPercent(progress: ScanProgress): number {
  if (progress.phases.length === 0) return 100;
  return Math.round((progress.completed_phase_ids.length / progress.phases.length) * 100);
}
