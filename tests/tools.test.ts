import { describe, expect, it } from 'vitest';
import { FocusError } from '../src/models/status.js';
import { bootstrapTool, statusTool } from '../src/tools/bootstrap.js';
import { recommendMcpsTool } from '../src/tools/catalog.js';
import { callTool } from '../src/tools/index.js';
import {
  listReferencesTool,
  readReferenceTool,
  suggestReferenceUpdateTool,
} from '../src/tools/references.js';
import { useFreshFocusHome } from './_helpers.js';

describe('bootstrap & status', () => {
  useFreshFocusHome();

  it('status before bootstrap returns not_started', () => {
    const s = statusTool();
    expect(s.bootstrap_status).toBe('not_started');
    expect(s.todo_items_count).toBe(0);
    expect(s.references.has_objectives).toBe(false);
    expect(s.version).toMatch(/\d+\.\d+\.\d+/);
  });

  it('bootstrap sets in_progress and returns instructions', () => {
    const out = bootstrapTool({ scan_depth_months: 1 });
    expect(out.status).toBe('started');
    expect(out.instructions.length).toBeGreaterThan(100);
    expect(out.recommended_steps.length).toBeGreaterThanOrEqual(5);
    expect(statusTool().bootstrap_status).toBe('in_progress');
  });

  it('rejects invalid scan_depth_months', () => {
    expect(() => bootstrapTool({ scan_depth_months: 0 })).toThrow();
    expect(() => bootstrapTool({ scan_depth_months: 99 })).toThrow();
    // -1 is valid (full history)
    expect(() => bootstrapTool({ scan_depth_months: -1 })).not.toThrow();
  });
});

describe('references', () => {
  useFreshFocusHome();

  it('lists empty references on a fresh home', () => {
    expect(listReferencesTool({}).references).toEqual([]);
  });

  it('suggest_reference_update during bootstrap writes directly', async () => {
    bootstrapTool({ scan_depth_months: 1 });
    const out = await suggestReferenceUpdateTool({
      path: 'stakeholders/jean.md',
      content: '---\nslug: jean\nname: Jean\n---\nHello',
      reason: 'initial bootstrap',
    });
    expect(out.status).toBe('applied');
    const r = readReferenceTool({ path: 'stakeholders/jean.md' });
    expect(r.frontmatter.slug).toBe('jean');
    expect(r.body.trim()).toBe('Hello');
  });

  it('suggest_reference_update after bootstrap lands as .pending.md', async () => {
    bootstrapTool({ scan_depth_months: 1 });
    await suggestReferenceUpdateTool({
      path: 'stakeholders/jean.md',
      content: '---\nslug: jean\nname: Jean\n---\nHello',
      reason: 'init',
    });
    // simulate bootstrap completion
    const { completeBootstrap } = await import('../src/tools/bootstrap.js');
    completeBootstrap();
    const out = await suggestReferenceUpdateTool({
      path: 'stakeholders/jean.md',
      content: '---\nslug: jean\nname: Jean Updated\n---\nHello again',
      reason: 'update',
    });
    expect(out.status).toBe('pending');
    expect(out.pending_path).toBe('stakeholders/jean.md.pending.md');
  });

  it('rejects path traversal', async () => {
    await expect(
      suggestReferenceUpdateTool({
        path: '../escape.md',
        content: 'x',
        reason: 'evil',
      }),
    ).rejects.toThrowError(FocusError);
  });

  it('throws NOT_FOUND for unknown reference', () => {
    expect(() => readReferenceTool({ path: 'projects/nope.md' })).toThrowError(FocusError);
  });
});

describe('recommend_mcps', () => {
  useFreshFocusHome();

  it('returns the full catalog without filter', () => {
    const out = recommendMcpsTool({});
    expect(out.recommendations.length).toBeGreaterThanOrEqual(7);
    const tools = out.recommendations.map((r) => r.tool);
    for (const required of ['gmail', 'outlook', 'teams', 'slack', 'drive', 'calendar', 'notion']) {
      expect(tools).toContain(required);
    }
  });

  it('filters by user_tools', () => {
    const out = recommendMcpsTool({ user_tools: ['gmail', 'notion'] });
    expect(out.recommendations.map((r) => r.tool).sort()).toEqual(['gmail', 'notion']);
  });
});

describe('callTool registry', () => {
  useFreshFocusHome();

  it('routes by name and validates input', async () => {
    const out = (await callTool('status', {})) as { bootstrap_status: string };
    expect(out.bootstrap_status).toBe('not_started');
  });

  it('throws INVALID_INPUT on bad arguments', async () => {
    await expect(callTool('claim_item', { item_id: '' })).rejects.toThrowError(FocusError);
  });

  it('throws on unknown tool', async () => {
    await expect(callTool('does_not_exist', {})).rejects.toThrowError(FocusError);
  });
});
