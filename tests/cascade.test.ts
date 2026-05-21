import { describe, expect, it } from 'vitest';
import { getCurrentTodoTool, markActionStatusTool, saveTodoTool } from '../src/tools/todo.js';
import { useFreshFocusHome } from './_helpers.js';

function seedChain() {
  saveTodoTool({
    items: [
      {
        id: 'i1',
        project: 'P',
        priority: 'P0',
        actions: [
          { id: 'A', label: 'A', type: 'message', status: 'actionable', depends_on: [] },
          { id: 'B', label: 'B', type: 'message', status: 'blocked', depends_on: ['A'] },
          { id: 'C', label: 'C', type: 'message', status: 'blocked', depends_on: ['B'] },
        ],
      },
    ],
    merge_mode: 'upsert',
  });
}

describe('mark_action_status cascade', () => {
  useFreshFocusHome();

  it('done(A) unblocks B but not C', () => {
    seedChain();
    const out = markActionStatusTool({ item_id: 'i1', action_id: 'A', new_status: 'done' });
    expect(out.unblocked_actions).toEqual(['B']);
    const i1 = getCurrentTodoTool({}).items[0];
    expect(i1?.actions.find((a) => a.id === 'B')?.status).toBe('actionable');
    expect(i1?.actions.find((a) => a.id === 'C')?.status).toBe('blocked');
  });

  it('done(A) then done(B) unblocks C', () => {
    seedChain();
    markActionStatusTool({ item_id: 'i1', action_id: 'A', new_status: 'done' });
    const out = markActionStatusTool({ item_id: 'i1', action_id: 'B', new_status: 'done' });
    expect(out.unblocked_actions).toEqual(['C']);
  });

  it('multi-dep action only unblocks when all deps are done', () => {
    saveTodoTool({
      items: [
        {
          id: 'i1',
          project: 'P',
          priority: 'P0',
          actions: [
            { id: 'A', label: 'A', type: 'message', status: 'actionable', depends_on: [] },
            { id: 'B', label: 'B', type: 'message', status: 'actionable', depends_on: [] },
            { id: 'Z', label: 'Z', type: 'message', status: 'blocked', depends_on: ['A', 'B'] },
          ],
        },
      ],
      merge_mode: 'upsert',
    });
    const firstA = markActionStatusTool({ item_id: 'i1', action_id: 'A', new_status: 'done' });
    expect(firstA.unblocked_actions).toEqual([]);
    const thenB = markActionStatusTool({ item_id: 'i1', action_id: 'B', new_status: 'done' });
    expect(thenB.unblocked_actions).toEqual(['Z']);
  });

  it('non-done status does not cascade', () => {
    seedChain();
    const out = markActionStatusTool({
      item_id: 'i1',
      action_id: 'A',
      new_status: 'in_progress',
    });
    expect(out.unblocked_actions).toEqual([]);
  });

  it('writes manual evidence on done by default', () => {
    seedChain();
    markActionStatusTool({ item_id: 'i1', action_id: 'A', new_status: 'done' });
    const i1 = getCurrentTodoTool({}).items[0];
    const a = i1?.actions.find((x) => x.id === 'A');
    expect(a?.evidence?.type).toBe('manual');
    expect(typeof a?.evidence?.timestamp).toBe('string');
  });
});
