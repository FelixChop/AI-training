import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { writeMeta } from '../db/meta.js';
import {
  ACTION_STATUSES,
  ACTION_TYPES,
  EVIDENCE_TYPES,
  FocusError,
  ITEM_STATUSES,
  PRIORITIES,
  SOURCE_TYPES,
} from '../models/status.js';
import {
  type Action,
  type Source,
  type TodoItem,
  type TodoItemRow,
  itemToRow,
  rowToItem,
} from '../models/todo.js';

const sourceSchema = z.object({
  type: z.enum(SOURCE_TYPES),
  ref: z.string(),
  description: z.string(),
  date: z.string(),
});

const evidenceSchema = z.object({
  type: z.enum(EVIDENCE_TYPES),
  ref: z.string().optional(),
  note: z.string().optional(),
  timestamp: z.string().optional(),
});

const actionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(ACTION_TYPES),
  status: z.enum(ACTION_STATUSES),
  depends_on: z.array(z.string()).default([]),
  blocked_reason: z.string().optional(),
  evidence: evidenceSchema.optional(),
});

const todoItemInputSchema = z
  .object({
    id: z.string().optional(),
    rank: z.number().int().nonnegative().optional(),
    project: z.string().min(1).optional(),
    priority: z.enum(PRIORITIES).optional(),
    context: z.string().optional(),
    sources: z.array(sourceSchema).optional(),
    actions: z.array(actionSchema).optional(),
    status: z.enum(ITEM_STATUSES).optional(),
  })
  .strict();

export const saveTodoSchema = z
  .object({
    items: z.array(todoItemInputSchema).min(1),
    merge_mode: z.enum(['upsert', 'replace']).default('upsert'),
  })
  .strict();
export type SaveTodoInput = z.infer<typeof saveTodoSchema>;

export const getCurrentTodoSchema = z
  .object({
    include_archived: z.boolean().optional().default(false),
    include_actions_blocked: z.boolean().optional().default(true),
  })
  .strict();
export type GetCurrentTodoInput = z.infer<typeof getCurrentTodoSchema>;

export const claimItemSchema = z
  .object({
    item_id: z.string().min(1),
    conversation_id: z.string().min(1),
    ttl_seconds: z.number().int().positive().optional().default(3600),
  })
  .strict();
export type ClaimItemInput = z.infer<typeof claimItemSchema>;

export const releaseItemSchema = z
  .object({
    item_id: z.string().min(1),
    conversation_id: z.string().min(1),
  })
  .strict();
export type ReleaseItemInput = z.infer<typeof releaseItemSchema>;

export const markActionStatusSchema = z
  .object({
    item_id: z.string().min(1),
    action_id: z.string().min(1),
    new_status: z.enum(['in_progress', 'done', 'cancelled']),
    evidence: evidenceSchema.optional(),
  })
  .strict();
export type MarkActionStatusInput = z.infer<typeof markActionStatusSchema>;

function nowIso(): string {
  return new Date().toISOString();
}

function fetchItem(id: string): TodoItem | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM todo_items WHERE id = ?').get(id) as
    | TodoItemRow
    | undefined;
  return row ? rowToItem(row) : null;
}

function maxRank(): number {
  const db = getDb();
  const row = db.prepare('SELECT MAX(rank) AS max FROM todo_items').get() as
    | { max: number | null }
    | undefined;
  return row?.max ?? 0;
}

function bumpUpdatedAt(): void {
  writeMeta(getDb(), 'todo_last_updated_at', nowIso());
}

function mergeSources(existing: Source[], incoming: Source[] | undefined): Source[] {
  if (!incoming) return existing;
  const seen = new Set(existing.map((s) => `${s.type}::${s.ref}`));
  const merged = [...existing];
  for (const s of incoming) {
    const key = `${s.type}::${s.ref}`;
    if (!seen.has(key)) {
      merged.push(s);
      seen.add(key);
    }
  }
  return merged;
}

type ActionInput = z.infer<typeof actionSchema>;

function normalizeAction(a: ActionInput): Action {
  const action: Action = {
    id: a.id,
    label: a.label,
    type: a.type,
    status: a.status,
    depends_on: a.depends_on ?? [],
  };
  if (a.blocked_reason !== undefined) action.blocked_reason = a.blocked_reason;
  if (a.evidence) {
    action.evidence = {
      type: a.evidence.type,
      ref: a.evidence.ref,
      note: a.evidence.note,
      timestamp: a.evidence.timestamp ?? nowIso(),
    };
  }
  return action;
}

function mergeActions(
  existing: Action[],
  incoming: ActionInput[] | undefined,
  mode: 'upsert' | 'replace',
): Action[] {
  if (!incoming) return existing;
  if (mode === 'replace') return incoming.map(normalizeAction);
  const byId = new Map(existing.map((a) => [a.id, a]));
  for (const inc of incoming) {
    const prior = byId.get(inc.id);
    const normalized = normalizeAction(inc);
    if (prior) {
      // Preserve status & evidence from existing record.
      const evidence = prior.evidence ?? normalized.evidence;
      const merged: Action = {
        id: normalized.id,
        label: normalized.label,
        type: normalized.type,
        status: prior.status,
        depends_on: normalized.depends_on,
      };
      if (normalized.blocked_reason !== undefined)
        merged.blocked_reason = normalized.blocked_reason;
      if (evidence) merged.evidence = evidence;
      byId.set(inc.id, merged);
    } else {
      byId.set(inc.id, normalized);
    }
  }
  return Array.from(byId.values());
}

export function saveTodoTool(input: SaveTodoInput): {
  saved: number;
  updated: number;
  created: number;
} {
  const parsed = saveTodoSchema.parse(input);
  const db = getDb();
  let created = 0;
  let updated = 0;

  const upsertStmt = db.prepare(`
    INSERT INTO todo_items (id, rank, project, priority, context, sources_json, actions_json, status, claimed_by, locked_until, created_at, updated_at)
    VALUES (@id, @rank, @project, @priority, @context, @sources_json, @actions_json, @status, @claimed_by, @locked_until, @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      rank = excluded.rank,
      project = excluded.project,
      priority = excluded.priority,
      context = excluded.context,
      sources_json = excluded.sources_json,
      actions_json = excluded.actions_json,
      updated_at = excluded.updated_at
  `);

  const tx = db.transaction(() => {
    let nextRank = maxRank() + 1;
    for (const incoming of parsed.items) {
      const existing = incoming.id ? fetchItem(incoming.id) : null;
      const now = nowIso();

      if (!existing) {
        if (!incoming.project || !incoming.priority) {
          throw new FocusError(
            'INVALID_INPUT',
            'New items require at least `project` and `priority`.',
          );
        }
        const item: TodoItem = {
          id: incoming.id ?? randomUUID(),
          rank: incoming.rank ?? nextRank++,
          project: incoming.project,
          priority: incoming.priority,
          context: incoming.context ?? '',
          sources: incoming.sources ?? [],
          actions: (incoming.actions ?? []).map(normalizeAction),
          status: incoming.status ?? 'open',
          claimed_by: null,
          locked_until: null,
          created_at: now,
          updated_at: now,
        };
        upsertStmt.run(itemToRow(item));
        created += 1;
      } else {
        const merged: TodoItem = {
          ...existing,
          rank: incoming.rank ?? existing.rank,
          project: incoming.project ?? existing.project,
          priority: incoming.priority ?? existing.priority,
          context: incoming.context ?? existing.context,
          sources: mergeSources(existing.sources, incoming.sources),
          actions: mergeActions(existing.actions, incoming.actions, parsed.merge_mode),
          // Authoritative fields stay as they were
          status: existing.status,
          claimed_by: existing.claimed_by,
          locked_until: existing.locked_until,
          updated_at: now,
        };
        upsertStmt.run(itemToRow(merged));
        updated += 1;
      }
    }
  });

  tx();
  bumpUpdatedAt();
  return { saved: parsed.items.length, updated, created };
}

export function getCurrentTodoTool(input: GetCurrentTodoInput): {
  items: TodoItem[];
  generated_at: string | null;
  last_updated_at: string | null;
} {
  const parsed = getCurrentTodoSchema.parse(input);
  const db = getDb();
  const rows = (
    parsed.include_archived
      ? db.prepare('SELECT * FROM todo_items ORDER BY rank ASC').all()
      : db.prepare("SELECT * FROM todo_items WHERE status = 'open' ORDER BY rank ASC").all()
  ) as TodoItemRow[];

  const items = rows.map(rowToItem).map((item) => {
    if (!parsed.include_actions_blocked) {
      return { ...item, actions: item.actions.filter((a) => a.status !== 'blocked') };
    }
    return item;
  });

  const firstCreated = rows.length > 0 ? (rows.map((r) => r.created_at).sort()[0] ?? null) : null;
  const lastUpdated =
    rows.length > 0
      ? (rows
          .map((r) => r.updated_at)
          .sort()
          .slice(-1)[0] ?? null)
      : null;

  return {
    items,
    generated_at: firstCreated,
    last_updated_at: lastUpdated,
  };
}

export function claimItemTool(input: ClaimItemInput): { claimed: true; expires_at: string } {
  const parsed = claimItemSchema.parse(input);
  const db = getDb();
  const nowMs = Date.now();
  const expiresAt = new Date(nowMs + parsed.ttl_seconds * 1000).toISOString();

  const tx = db.transaction(() => {
    const row = db
      .prepare<[string], TodoItemRow>('SELECT * FROM todo_items WHERE id = ?')
      .get(parsed.item_id);
    if (!row) {
      throw new FocusError('NOT_FOUND', `Item ${parsed.item_id} does not exist.`);
    }
    if (
      row.claimed_by &&
      row.claimed_by !== parsed.conversation_id &&
      row.locked_until &&
      new Date(row.locked_until).getTime() > nowMs
    ) {
      throw new FocusError(
        'TASK_LOCKED',
        `Item ${parsed.item_id} is locked until ${row.locked_until}.`,
        {
          claimed_by: row.claimed_by,
          locked_until: row.locked_until,
        },
      );
    }
    db.prepare(
      'UPDATE todo_items SET claimed_by = ?, locked_until = ?, updated_at = ? WHERE id = ?',
    ).run(parsed.conversation_id, expiresAt, new Date(nowMs).toISOString(), parsed.item_id);
  });

  tx();
  return { claimed: true, expires_at: expiresAt };
}

export function releaseItemTool(input: ReleaseItemInput): { released: true } {
  const parsed = releaseItemSchema.parse(input);
  const db = getDb();
  const row = db
    .prepare<[string], TodoItemRow>('SELECT * FROM todo_items WHERE id = ?')
    .get(parsed.item_id);
  if (!row) {
    throw new FocusError('NOT_FOUND', `Item ${parsed.item_id} does not exist.`);
  }
  if (row.claimed_by && row.claimed_by !== parsed.conversation_id) {
    throw new FocusError(
      'TASK_LOCKED',
      `Item ${parsed.item_id} is claimed by another conversation.`,
    );
  }
  db.prepare(
    'UPDATE todo_items SET claimed_by = NULL, locked_until = NULL, updated_at = ? WHERE id = ?',
  ).run(nowIso(), parsed.item_id);
  return { released: true };
}

export function markActionStatusTool(input: MarkActionStatusInput): {
  updated: true;
  unblocked_actions: string[];
} {
  const parsed = markActionStatusSchema.parse(input);
  const db = getDb();
  const unblocked: string[] = [];

  const tx = db.transaction(() => {
    const item = fetchItem(parsed.item_id);
    if (!item) {
      throw new FocusError('NOT_FOUND', `Item ${parsed.item_id} does not exist.`);
    }
    const idx = item.actions.findIndex((a) => a.id === parsed.action_id);
    if (idx === -1) {
      throw new FocusError(
        'NOT_FOUND',
        `Action ${parsed.action_id} does not exist on item ${parsed.item_id}.`,
      );
    }
    const target = item.actions[idx];
    if (!target) {
      throw new FocusError('NOT_FOUND', `Action ${parsed.action_id} vanished.`);
    }
    const next: Action = {
      ...target,
      status: parsed.new_status,
    };
    if (parsed.new_status === 'done') {
      next.evidence = {
        type: parsed.evidence?.type ?? 'manual',
        ref: parsed.evidence?.ref,
        note: parsed.evidence?.note,
        timestamp: parsed.evidence?.timestamp ?? nowIso(),
      };
    } else if (parsed.evidence) {
      next.evidence = {
        type: parsed.evidence.type,
        ref: parsed.evidence.ref,
        note: parsed.evidence.note,
        timestamp: parsed.evidence.timestamp ?? nowIso(),
      };
    }
    item.actions[idx] = next;

    if (parsed.new_status === 'done') {
      for (let i = 0; i < item.actions.length; i++) {
        const candidate = item.actions[i];
        if (!candidate) continue;
        if (candidate.status !== 'blocked') continue;
        if (!candidate.depends_on.includes(parsed.action_id)) continue;
        const allDone = candidate.depends_on.every((depId) => {
          const dep = item.actions.find((a) => a.id === depId);
          return dep?.status === 'done';
        });
        if (allDone) {
          item.actions[i] = { ...candidate, status: 'actionable' };
          unblocked.push(candidate.id);
        }
      }
    }

    item.updated_at = nowIso();
    db.prepare('UPDATE todo_items SET actions_json = ?, updated_at = ? WHERE id = ?').run(
      JSON.stringify(item.actions),
      item.updated_at,
      item.id,
    );
  });

  tx();
  bumpUpdatedAt();
  return { updated: true, unblocked_actions: unblocked };
}
