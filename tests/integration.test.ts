import { describe, expect, it } from 'vitest';
import { bootstrapTool, completeBootstrap, statusTool } from '../src/tools/bootstrap.js';
import { listReferencesTool, suggestReferenceUpdateTool } from '../src/tools/references.js';
import { getScanPlanTool, resumeBootstrapTool, updateScanProgressTool } from '../src/tools/scan.js';
import {
  claimItemTool,
  getCurrentTodoTool,
  markActionStatusTool,
  saveTodoTool,
} from '../src/tools/todo.js';
import { useFreshFocusHome } from './_helpers.js';

describe('integration — full bootstrap flow', () => {
  useFreshFocusHome();

  it('walks bootstrap → references → todo → claim → cascade → read', async () => {
    // 1. Status before bootstrap
    expect(statusTool().bootstrap_status).toBe('not_started');

    // 2. Bootstrap kickoff
    const b = bootstrapTool({ scan_depth_months: 1 });
    expect(b.status).toBe('started');
    expect(statusTool().bootstrap_status).toBe('in_progress');

    // 3. Knowledge base: 3 suggest_reference_update calls
    await suggestReferenceUpdateTool({
      path: 'stakeholders/jean_lambert.md',
      content:
        '---\nslug: jean_lambert\nname: Jean Lambert\nemail: jean@safran.fr\nside: external\n---\n## Style observé\n- Court, factuel',
      reason: 'detected from emails',
    });
    await suggestReferenceUpdateTool({
      path: 'projects/safran_2026.md',
      content:
        "---\nslug: safran_2026\nname: Safran 2026\nstatus: active\n---\n## Contexte\nAppel d'offre infra 2026.",
      reason: 'thread clustering',
    });
    await suggestReferenceUpdateTool({
      path: 'style_guide.md',
      content:
        '---\nlanguage_primary: fr\nsignoff_default: "Bien à vous, Félix"\n---\n## Règles\n- Phrases courtes',
      reason: 'style detection',
    });

    const list = listReferencesTool({});
    const paths = list.references.map((r) => r.path).sort();
    expect(paths).toEqual([
      'projects/safran_2026.md',
      'stakeholders/jean_lambert.md',
      'style_guide.md',
    ]);

    // 4. First todo: 3 items
    const saved = saveTodoTool({
      items: [
        {
          id: 'item-1',
          project: 'Safran 2026',
          priority: 'P0',
          context: "Relancer sur l'appel d'offre",
          sources: [
            {
              type: 'email',
              ref: 'mail-14',
              description: 'mail Jean du 14/05',
              date: '2026-05-14',
            },
          ],
          actions: [
            {
              id: 'a1',
              label: 'Relancer Tiffany',
              type: 'message',
              status: 'actionable',
              depends_on: [],
            },
            {
              id: 'a2',
              label: 'Envoyer la version révisée à Jean',
              type: 'message',
              status: 'blocked',
              depends_on: ['a1'],
              blocked_reason: 'En attente du retour de Tiffany sur la clause 1.6',
            },
          ],
        },
        { id: 'item-2', project: 'Refonte SI', priority: 'P1', actions: [] },
        { id: 'item-3', project: 'Bootcamp', priority: 'P2', actions: [] },
      ],
      merge_mode: 'upsert',
    });
    expect(saved.created).toBe(3);

    // 5. Claim and cascade
    const claim = claimItemTool({ item_id: 'item-1', conversation_id: 'conv-1' });
    expect(claim.claimed).toBe(true);

    const mark = markActionStatusTool({
      item_id: 'item-1',
      action_id: 'a1',
      new_status: 'done',
      evidence: { type: 'email', ref: 'mail-42-sent', note: 'Tiffany a confirmé' },
    });
    expect(mark.unblocked_actions).toEqual(['a2']);

    // 6. Final read
    const todo = getCurrentTodoTool({});
    expect(todo.items).toHaveLength(3);
    const item1 = todo.items.find((i) => i.id === 'item-1');
    expect(item1?.claimed_by).toBe('conv-1');
    expect(item1?.actions.find((a) => a.id === 'a1')?.status).toBe('done');
    expect(item1?.actions.find((a) => a.id === 'a2')?.status).toBe('actionable');

    // 7. Complete bootstrap and verify status reflects it
    completeBootstrap();
    const finalStatus = statusTool();
    expect(finalStatus.bootstrap_status).toBe('complete');
    expect(finalStatus.references.stakeholders_count).toBe(1);
    expect(finalStatus.references.projects_count).toBe(1);
    expect(finalStatus.references.has_style_guide).toBe(true);
  });
});

describe('integration — resumable bootstrap with scan plan', () => {
  useFreshFocusHome();

  it('survives an interrupted scan and resumes from the right phase', () => {
    // 1. Start bootstrap and load the structured plan.
    bootstrapTool({ scan_depth_months: 1 });
    const plan = getScanPlanTool({ scan_depth_months: 1 });
    expect(plan.phases).toHaveLength(7);

    // 2. Simulate work on the first 3 phases (with batched progress).
    updateScanProgressTool({ phase_id: 'p1', items_processed_delta: 100 });
    updateScanProgressTool({ phase_id: 'p1', items_processed_delta: 80, mark_complete: true });
    updateScanProgressTool({ phase_id: 'p2', items_processed_delta: 150, mark_complete: true });
    updateScanProgressTool({ phase_id: 'p3', items_processed_delta: 12, mark_complete: true });

    // 3. Simulate a crash: a brand new session calls resume_bootstrap first.
    const resume = resumeBootstrapTool({});
    expect(resume.status).toBe('resume');
    if (resume.status === 'resume') {
      expect(resume.completed_phase_ids).toEqual(['p1', 'p2', 'p3']);
      expect(resume.items_processed).toBe(342);
      expect(resume.current_phase?.id).toBe('p4');
    }

    // 4. Resume through the remaining phases in order.
    updateScanProgressTool({ phase_id: 'p4', mark_complete: true });
    updateScanProgressTool({ phase_id: 'p5', mark_complete: true });
    updateScanProgressTool({ phase_id: 'p6', mark_complete: true });
    const last = updateScanProgressTool({ phase_id: 'p7', mark_complete: true });

    // 5. Bootstrap auto-completes when the last phase is done.
    expect(last.bootstrap_completed).toBe(true);
    expect(last.next_phase).toBeNull();
    const finalStatus = statusTool();
    expect(finalStatus.bootstrap_status).toBe('complete');
    expect(finalStatus.scan_progress?.completed_phase_count).toBe(7);
    expect(finalStatus.scan_progress?.progress_percent).toBe(100);
  });
});
