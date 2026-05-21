export const PRIORITIES = ['P0', 'P1', 'P2'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const ITEM_STATUSES = ['open', 'archived'] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const ACTION_STATUSES = [
  'actionable',
  'blocked',
  'in_progress',
  'done',
  'cancelled',
] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

export const ACTION_TYPES = [
  'message',
  'document',
  'validation',
  'meeting',
  'research',
  'other',
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const SOURCE_TYPES = [
  'email',
  'teams',
  'slack',
  'drive',
  'calendar',
  'notion',
  'other',
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const EVIDENCE_TYPES = ['email', 'teams', 'manual', 'inferred'] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export const REFERENCE_CATEGORIES = [
  'objectives',
  'orgchart',
  'style_guide',
  'stakeholders',
  'projects',
] as const;
export type ReferenceCategory = (typeof REFERENCE_CATEGORIES)[number];

export const FOCUS_ERROR_CODES = [
  'TASK_LOCKED',
  'NOT_FOUND',
  'BOOTSTRAP_INCOMPLETE',
  'INVALID_INPUT',
  'IO_ERROR',
  'MIGRATION_REQUIRED',
] as const;
export type FocusErrorCode = (typeof FOCUS_ERROR_CODES)[number];

export class FocusError extends Error {
  readonly code: FocusErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: FocusErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'FocusError';
    this.code = code;
    this.details = details;
  }

  toJSON(): { code: FocusErrorCode; message: string; details?: Record<string, unknown> } {
    return { code: this.code, message: this.message, details: this.details };
  }
}
