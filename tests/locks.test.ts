import { describe, expect, it } from 'vitest';
import { FocusError } from '../src/models/status.js';
import {
  claimItemTool,
  markActionStatusTool,
  releaseItemTool,
  saveTodoTool,
} from '../src/tools/todo.js';
import { useFreshFocusHome } from './_helpers.js';

function seedItem(id = 'item-1') {
  saveTodoTool({
    items: [
      {
        id,
        project: 'Project A',
        priority: 'P1',
        context: 'ctx',
        actions: [
          { id: 'a1', label: 'do thing', type: 'message', status: 'actionable', depends_on: [] },
        ],
      },
    ],
    merge_mode: 'upsert',
  });
}

describe('locks', () => {
  useFreshFocusHome();

  it('claims successfully on a free item', () => {
    seedItem();
    const out = claimItemTool({ item_id: 'item-1', conversation_id: 'convA' });
    expect(out.claimed).toBe(true);
    expect(typeof out.expires_at).toBe('string');
  });

  it('rejects a second claimant while lock is active', () => {
    seedItem();
    claimItemTool({ item_id: 'item-1', conversation_id: 'convA' });
    expect(() => claimItemTool({ item_id: 'item-1', conversation_id: 'convB' })).toThrowError(
      FocusError,
    );
  });

  it('allows the same conversation to re-claim', () => {
    seedItem();
    claimItemTool({ item_id: 'item-1', conversation_id: 'convA' });
    const second = claimItemTool({ item_id: 'item-1', conversation_id: 'convA' });
    expect(second.claimed).toBe(true);
  });

  it('lets another conversation claim once TTL expires', async () => {
    seedItem();
    claimItemTool({ item_id: 'item-1', conversation_id: 'convA', ttl_seconds: 1 });
    await new Promise((r) => setTimeout(r, 1100));
    const out = claimItemTool({ item_id: 'item-1', conversation_id: 'convB' });
    expect(out.claimed).toBe(true);
  });

  it('refuses release by a non-claimant conversation', () => {
    seedItem();
    claimItemTool({ item_id: 'item-1', conversation_id: 'convA' });
    expect(() => releaseItemTool({ item_id: 'item-1', conversation_id: 'convB' })).toThrowError(
      FocusError,
    );
  });

  it('releases by the claimant', () => {
    seedItem();
    claimItemTool({ item_id: 'item-1', conversation_id: 'convA' });
    expect(releaseItemTool({ item_id: 'item-1', conversation_id: 'convA' }).released).toBe(true);
    const next = claimItemTool({ item_id: 'item-1', conversation_id: 'convB' });
    expect(next.claimed).toBe(true);
  });

  it('throws NOT_FOUND on unknown item', () => {
    expect(() => claimItemTool({ item_id: 'nope', conversation_id: 'x' })).toThrowError(FocusError);
  });

  // smoke: cascade does not touch lock state
  it('cascade does not change claim state', () => {
    saveTodoTool({
      items: [
        {
          id: 'item-2',
          project: 'P',
          priority: 'P0',
          actions: [
            { id: 'a1', label: 'first', type: 'message', status: 'actionable', depends_on: [] },
            { id: 'a2', label: 'second', type: 'message', status: 'blocked', depends_on: ['a1'] },
          ],
        },
      ],
      merge_mode: 'upsert',
    });
    claimItemTool({ item_id: 'item-2', conversation_id: 'convA' });
    const out = markActionStatusTool({
      item_id: 'item-2',
      action_id: 'a1',
      new_status: 'done',
    });
    expect(out.unblocked_actions).toEqual(['a2']);
    // Conv B should still be locked out.
    expect(() => claimItemTool({ item_id: 'item-2', conversation_id: 'convB' })).toThrowError(
      FocusError,
    );
  });
});
