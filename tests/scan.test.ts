import { describe, expect, it } from 'vitest';
import { getDb } from '../src/db/client.js';
import { readMeta } from '../src/db/meta.js';
import { SCAN_PROGRESS_META_KEY } from '../src/models/scan.js';
import { bootstrapTool, statusTool } from '../src/tools/bootstrap.js';
import { getScanPlanTool, resumeBootstrapTool, updateScanProgressTool } from '../src/tools/scan.js';
import { useFreshFocusHome } from './_helpers.js';

describe('get_scan_plan', () => {
  useFreshFocusHome();

  it('returns 7 canonical phases with the requested depth', () => {
    const plan = getScanPlanTool({ scan_depth_months: 1 });
    expect(plan.phases.map((p) => p.id)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7']);
    expect(plan.scan_depth_months).toBe(1);
    expect(plan.resumed).toBe(false);
    expect(plan.current_phase_id).toBe('p1');
    expect(plan.progress_percent).toBe(0);
    // Sent and received phases should have a date in their query for depth=1.
    expect(String(plan.phases[0]?.params_hint.query)).toMatch(/after:\d{4}-\d{2}-\d{2}/);
    expect(String(plan.phases[1]?.params_hint.query)).toMatch(/after:\d{4}-\d{2}-\d{2}/);
  });

  it('omits the "after:" clause when scan_depth_months is -1', () => {
    const plan = getScanPlanTool({ scan_depth_months: -1 });
    expect(String(plan.phases[0]?.params_hint.query)).toBe('from:me');
    expect(String(plan.phases[1]?.params_hint.query)).toBe('to:me');
  });

  it('is idempotent: a second call returns the same plan_id and resumed=true', () => {
    const first = getScanPlanTool({ scan_depth_months: 3 });
    const second = getScanPlanTool({ scan_depth_months: 12 });
    expect(second.plan_id).toBe(first.plan_id);
    expect(second.scan_depth_months).toBe(3);
    expect(second.resumed).toBe(true);
  });
});

describe('update_scan_progress', () => {
  useFreshFocusHome();

  it('throws NOT_FOUND when no plan exists', () => {
    expect(() => updateScanProgressTool({ phase_id: 'p1', items_processed_delta: 1 })).toThrow(
      /No scan plan in progress/,
    );
  });

  it('rejects unknown phase ids', () => {
    getScanPlanTool({ scan_depth_months: 1 });
    expect(() => updateScanProgressTool({ phase_id: 'p999', items_processed_delta: 1 })).toThrow(
      /not part of the current scan plan/,
    );
  });

  it('increments items_processed without changing current_phase when not marked complete', () => {
    getScanPlanTool({ scan_depth_months: 1 });
    const r1 = updateScanProgressTool({ phase_id: 'p1', items_processed_delta: 50 });
    expect(r1.current_phase_id).toBe('p1');
    expect(r1.items_processed).toBe(50);
    const r2 = updateScanProgressTool({ phase_id: 'p1', items_processed_delta: 30 });
    expect(r2.items_processed).toBe(80);
  });

  it('advances current_phase_id when a phase is marked complete', () => {
    getScanPlanTool({ scan_depth_months: 1 });
    const r = updateScanProgressTool({ phase_id: 'p1', mark_complete: true });
    // p2 has no deps, so it should be next.
    expect(r.current_phase_id).toBe('p2');
  });

  it('respects dependencies: p3 is not next until both p1 and p2 are done', () => {
    getScanPlanTool({ scan_depth_months: 1 });
    const a = updateScanProgressTool({ phase_id: 'p1', mark_complete: true });
    expect(a.current_phase_id).toBe('p2');
    const b = updateScanProgressTool({ phase_id: 'p2', mark_complete: true });
    expect(b.current_phase_id).toBe('p3');
  });

  it('auto-completes the bootstrap when the last phase is marked complete', () => {
    getScanPlanTool({ scan_depth_months: 1 });
    bootstrapTool({ scan_depth_months: 1 }); // sets bootstrap_status = in_progress
    for (const phase of ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7']) {
      const r = updateScanProgressTool({ phase_id: phase, mark_complete: true });
      if (phase !== 'p7') expect(r.bootstrap_completed).toBe(false);
    }
    expect(statusTool().bootstrap_status).toBe('complete');
  });
});

describe('resume_bootstrap', () => {
  useFreshFocusHome();

  it('reports no_resume_needed when no plan exists', () => {
    const r = resumeBootstrapTool({});
    expect(r.status).toBe('no_resume_needed');
  });

  it('returns the current phase after interruption and is read-only', () => {
    getScanPlanTool({ scan_depth_months: 1 });
    updateScanProgressTool({ phase_id: 'p1', items_processed_delta: 42, mark_complete: true });

    const before = readMeta(getDb(), SCAN_PROGRESS_META_KEY);
    const r = resumeBootstrapTool({});
    const after = readMeta(getDb(), SCAN_PROGRESS_META_KEY);

    expect(before).toBe(after); // state untouched
    expect(r.status).toBe('resume');
    if (r.status === 'resume') {
      expect(r.current_phase?.id).toBe('p2');
      expect(r.completed_phase_ids).toEqual(['p1']);
      expect(r.items_processed).toBe(42);
      expect(r.instructions).toMatch(/p2/);
    }
  });
});

describe('bootstrap idempotence', () => {
  useFreshFocusHome();

  it('returns resume data on a second call when a plan is already in progress', () => {
    const first = bootstrapTool({ scan_depth_months: 1 });
    expect(first.status).toBe('started');
    // Seed a plan via get_scan_plan so the resume path has something to read.
    getScanPlanTool({ scan_depth_months: 1 });
    updateScanProgressTool({ phase_id: 'p1', mark_complete: true });

    const second = bootstrapTool({ scan_depth_months: 1 });
    expect(second.status).toBe('resume');
    if (second.status === 'resume') {
      expect(second.current_phase?.id).toBe('p2');
      expect(second.completed_phase_ids).toEqual(['p1']);
    }
  });
});

describe('status includes scan_progress', () => {
  useFreshFocusHome();

  it('returns null scan_progress when no plan exists', () => {
    expect(statusTool().scan_progress).toBeNull();
  });

  it('returns a populated summary after get_scan_plan + update', () => {
    getScanPlanTool({ scan_depth_months: 1 });
    updateScanProgressTool({ phase_id: 'p1', items_processed_delta: 7, mark_complete: true });
    const s = statusTool();
    expect(s.scan_progress).not.toBeNull();
    expect(s.scan_progress?.completed_phase_count).toBe(1);
    expect(s.scan_progress?.total_phase_count).toBe(7);
    expect(s.scan_progress?.items_processed).toBe(7);
    expect(s.scan_progress?.current_phase_id).toBe('p2');
  });
});
