import { describe, expect, it } from 'vitest';
import {
  claimItemTool,
  getCurrentTodoTool,
  markActionStatusTool,
  saveTodoTool,
} from '../src/tools/todo.js';
import { useFreshFocusHome } from './_helpers.js';

describe('save_todo upsert merge', () => {
  useFreshFocusHome();

  it('creates new items and assigns ranks', () => {
    const out = saveTodoTool({
      items: [
        {
          id: 'i1',
          project: 'X',
          priority: 'P0',
          actions: [
            { id: 'a1', label: 'L', type: 'message', status: 'actionable', depends_on: [] },
          ],
        },
        {
          id: 'i2',
          project: 'Y',
          priority: 'P1',
          actions: [],
        },
      ],
      merge_mode: 'upsert',
    });
    expect(out.created).toBe(2);
    expect(out.updated).toBe(0);
    const todo = getCurrentTodoTool({});
    expect(todo.items.map((i) => i.id).sort()).toEqual(['i1', 'i2']);
  });

  it('preserves status / claimed_by / locked_until on existing items', () => {
    saveTodoTool({
      items: [
        {
          id: 'i1',
          project: 'X',
          priority: 'P0',
          actions: [
            { id: 'a1', label: 'L', type: 'message', status: 'actionable', depends_on: [] },
          ],
        },
      ],
      merge_mode: 'upsert',
    });
    claimItemTool({ item_id: 'i1', conversation_id: 'convA' });

    saveTodoTool({
      items: [
        {
          id: 'i1',
          project: 'X-updated',
          priority: 'P2',
          status: 'archived',
          actions: [],
        },
      ],
      merge_mode: 'upsert',
    });
    const todo = getCurrentTodoTool({ include_archived: true });
    const i1 = todo.items.find((i) => i.id === 'i1');
    expect(i1).toBeDefined();
    expect(i1?.project).toBe('X-updated');
    expect(i1?.priority).toBe('P2');
    expect(i1?.status).toBe('open'); // not overwritten
    expect(i1?.claimed_by).toBe('convA');
    expect(i1?.locked_until).not.toBeNull();
  });

  it('preserves action status and evidence', () => {
    saveTodoTool({
      items: [
        {
          id: 'i1',
          project: 'X',
          priority: 'P0',
          actions: [
            { id: 'a1', label: 'L1', type: 'message', status: 'actionable', depends_on: [] },
          ],
        },
      ],
      merge_mode: 'upsert',
    });
    markActionStatusTool({
      item_id: 'i1',
      action_id: 'a1',
      new_status: 'done',
      evidence: { type: 'email', ref: 'mail-42' },
    });

    saveTodoTool({
      items: [
        {
          id: 'i1',
          project: 'X',
          priority: 'P0',
          actions: [
            // user provides actionable but it should stay done
            {
              id: 'a1',
              label: 'L1-updated',
              type: 'message',
              status: 'actionable',
              depends_on: [],
            },
          ],
        },
      ],
      merge_mode: 'upsert',
    });
    const i1 = getCurrentTodoTool({}).items.find((i) => i.id === 'i1');
    expect(i1?.actions[0]?.status).toBe('done');
    expect(i1?.actions[0]?.label).toBe('L1-updated');
    expect(i1?.actions[0]?.evidence?.ref).toBe('mail-42');
  });

  it('keeps actions absent from payload (no silent delete)', () => {
    saveTodoTool({
      items: [
        {
          id: 'i1',
          project: 'X',
          priority: 'P0',
          actions: [
            { id: 'a1', label: 'L1', type: 'message', status: 'actionable', depends_on: [] },
            { id: 'a2', label: 'L2', type: 'message', status: 'actionable', depends_on: [] },
          ],
        },
      ],
      merge_mode: 'upsert',
    });
    saveTodoTool({
      items: [
        {
          id: 'i1',
          project: 'X',
          priority: 'P0',
          actions: [
            { id: 'a2', label: 'L2-edited', type: 'message', status: 'actionable', depends_on: [] },
          ],
        },
      ],
      merge_mode: 'upsert',
    });
    const i1 = getCurrentTodoTool({}).items.find((i) => i.id === 'i1');
    const ids = (i1?.actions ?? []).map((a) => a.id).sort();
    expect(ids).toEqual(['a1', 'a2']);
  });

  it('replace mode swaps the actions array entirely', () => {
    saveTodoTool({
      items: [
        {
          id: 'i1',
          project: 'X',
          priority: 'P0',
          actions: [
            { id: 'a1', label: 'L1', type: 'message', status: 'actionable', depends_on: [] },
            { id: 'a2', label: 'L2', type: 'message', status: 'actionable', depends_on: [] },
          ],
        },
      ],
      merge_mode: 'upsert',
    });
    saveTodoTool({
      items: [
        {
          id: 'i1',
          project: 'X',
          priority: 'P0',
          actions: [
            { id: 'a3', label: 'L3', type: 'message', status: 'actionable', depends_on: [] },
          ],
        },
      ],
      merge_mode: 'replace',
    });
    const i1 = getCurrentTodoTool({}).items.find((i) => i.id === 'i1');
    expect((i1?.actions ?? []).map((a) => a.id)).toEqual(['a3']);
  });

  it('merges sources by (type, ref)', () => {
    saveTodoTool({
      items: [
        {
          id: 'i1',
          project: 'X',
          priority: 'P0',
          sources: [{ type: 'email', ref: 'm1', description: 'mail 1', date: '2026-01-01' }],
          actions: [],
        },
      ],
      merge_mode: 'upsert',
    });
    saveTodoTool({
      items: [
        {
          id: 'i1',
          project: 'X',
          priority: 'P0',
          sources: [
            { type: 'email', ref: 'm1', description: 'duplicate', date: '2026-01-01' },
            { type: 'email', ref: 'm2', description: 'mail 2', date: '2026-01-02' },
          ],
          actions: [],
        },
      ],
      merge_mode: 'upsert',
    });
    const i1 = getCurrentTodoTool({}).items.find((i) => i.id === 'i1');
    expect(i1?.sources.map((s) => s.ref).sort()).toEqual(['m1', 'm2']);
  });
});
