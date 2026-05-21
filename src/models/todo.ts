import type {
  ActionStatus,
  ActionType,
  EvidenceType,
  ItemStatus,
  Priority,
  SourceType,
} from './status.js';

export type Evidence = {
  type: EvidenceType;
  ref?: string;
  note?: string;
  timestamp: string;
};

export type Action = {
  id: string;
  label: string;
  type: ActionType;
  status: ActionStatus;
  depends_on: string[];
  blocked_reason?: string;
  evidence?: Evidence;
};

export type Source = {
  type: SourceType;
  ref: string;
  description: string;
  date: string;
};

export type TodoItem = {
  id: string;
  rank: number;
  project: string;
  priority: Priority;
  context: string;
  sources: Source[];
  actions: Action[];
  status: ItemStatus;
  claimed_by: string | null;
  locked_until: string | null;
  created_at: string;
  updated_at: string;
};

export type TodoItemRow = {
  id: string;
  rank: number;
  project: string;
  priority: string;
  context: string;
  sources_json: string;
  actions_json: string;
  status: string;
  claimed_by: string | null;
  locked_until: string | null;
  created_at: string;
  updated_at: string;
};

export function rowToItem(row: TodoItemRow): TodoItem {
  return {
    id: row.id,
    rank: row.rank,
    project: row.project,
    priority: row.priority as Priority,
    context: row.context,
    sources: JSON.parse(row.sources_json) as Source[],
    actions: JSON.parse(row.actions_json) as Action[],
    status: row.status as ItemStatus,
    claimed_by: row.claimed_by,
    locked_until: row.locked_until,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function itemToRow(item: TodoItem): TodoItemRow {
  return {
    id: item.id,
    rank: item.rank,
    project: item.project,
    priority: item.priority,
    context: item.context,
    sources_json: JSON.stringify(item.sources),
    actions_json: JSON.stringify(item.actions),
    status: item.status,
    claimed_by: item.claimed_by,
    locked_until: item.locked_until,
    created_at: item.created_at,
    updated_at: item.updated_at,
  };
}
