import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { FocusError } from '../models/status.js';
import { logToolCall } from '../utils/logger.js';
import {
  type BootstrapInput,
  bootstrapInputSchema,
  bootstrapTool,
  statusTool,
} from './bootstrap.js';
import { type RecommendMcpsInput, recommendMcpsSchema, recommendMcpsTool } from './catalog.js';
import {
  type ListReferencesInput,
  type ReadReferenceInput,
  type SuggestReferenceUpdateInput,
  listReferencesSchema,
  listReferencesTool,
  readReferenceSchema,
  readReferenceTool,
  suggestReferenceUpdateSchema,
  suggestReferenceUpdateTool,
} from './references.js';
import {
  type ClaimItemInput,
  type GetCurrentTodoInput,
  type MarkActionStatusInput,
  type ReleaseItemInput,
  type SaveTodoInput,
  claimItemSchema,
  claimItemTool,
  getCurrentTodoSchema,
  getCurrentTodoTool,
  markActionStatusSchema,
  markActionStatusTool,
  releaseItemSchema,
  releaseItemTool,
  saveTodoSchema,
  saveTodoTool,
} from './todo.js';
import { checkForUpdatesSchema, checkForUpdatesTool } from './updates.js';

type ToolDefinition<I, O> = {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  handler: (input: I) => Promise<O> | O;
};

function summarizeOutput(output: unknown): unknown {
  if (output === null || output === undefined) return output;
  if (typeof output === 'string') return output.length > 200 ? `${output.slice(0, 200)}…` : output;
  if (Array.isArray(output)) return { _array_length: output.length };
  if (typeof output === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(output as Record<string, unknown>)) {
      if (Array.isArray(v)) out[k] = { _array_length: v.length };
      else if (typeof v === 'object' && v !== null) out[k] = '[object]';
      else out[k] = v;
    }
    return out;
  }
  return output;
}

export const TOOLS: ToolDefinition<unknown, unknown>[] = [
  {
    name: 'status',
    description:
      'Return the current focus state: bootstrap status, todo count, references summary, version.',
    inputSchema: z.object({}).strict(),
    handler: () => statusTool() as unknown,
  },
  {
    name: 'bootstrap',
    description:
      'Start the initial knowledge-base scan. Returns instructions for the host AI to follow. The host AI orchestrates the actual scan.',
    inputSchema: bootstrapInputSchema,
    handler: (input) => bootstrapTool(input as BootstrapInput) as unknown,
  },
  {
    name: 'list_references',
    description: 'List reference markdown files, optionally filtered by category.',
    inputSchema: listReferencesSchema,
    handler: (input) => listReferencesTool(input as ListReferencesInput) as unknown,
  },
  {
    name: 'read_reference',
    description: 'Read the full content of a reference file (frontmatter + body).',
    inputSchema: readReferenceSchema,
    handler: (input) => readReferenceTool(input as ReadReferenceInput) as unknown,
  },
  {
    name: 'suggest_reference_update',
    description:
      'Propose a write to a reference file. During bootstrap, the write is applied directly; otherwise, it lands as `<path>.pending.md` for the user to review.',
    inputSchema: suggestReferenceUpdateSchema,
    handler: (input) => suggestReferenceUpdateTool(input as SuggestReferenceUpdateInput) as unknown,
  },
  {
    name: 'save_todo',
    description:
      'Persist or upsert todo items. Preserves authoritative fields (status, claimed_by, locked_until) and action status/evidence on existing items.',
    inputSchema: saveTodoSchema,
    handler: (input) => saveTodoTool(input as SaveTodoInput) as unknown,
  },
  {
    name: 'get_current_todo',
    description: 'Return the current todo (open by default, archived optional).',
    inputSchema: getCurrentTodoSchema,
    handler: (input) => getCurrentTodoTool(input as GetCurrentTodoInput) as unknown,
  },
  {
    name: 'claim_item',
    description:
      'Lock a todo item for a conversation. Throws TASK_LOCKED if another conversation holds an active lock.',
    inputSchema: claimItemSchema,
    handler: (input) => claimItemTool(input as ClaimItemInput) as unknown,
  },
  {
    name: 'release_item',
    description: 'Release a previously claimed item. Only the claimant conversation may release.',
    inputSchema: releaseItemSchema,
    handler: (input) => releaseItemTool(input as ReleaseItemInput) as unknown,
  },
  {
    name: 'mark_action_status',
    description:
      'Update an action status. On `done`, focus cascades to unblock dependent actions whose deps are all done.',
    inputSchema: markActionStatusSchema,
    handler: (input) => markActionStatusTool(input as MarkActionStatusInput) as unknown,
  },
  {
    name: 'recommend_mcps',
    description: 'Return the catalog of recommended business MCPs, optionally filtered.',
    inputSchema: recommendMcpsSchema,
    handler: (input) => recommendMcpsTool(input as RecommendMcpsInput) as unknown,
  },
  {
    name: 'check_for_updates',
    description: 'Check GitHub Releases for a newer version of focus. 1h cache. Silent on errors.',
    inputSchema: checkForUpdatesSchema,
    handler: () => checkForUpdatesTool(),
  },
];

export function toolListForMcp() {
  return TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(t.inputSchema, { target: 'jsonSchema7', $refStrategy: 'none' }),
  }));
}

export async function callTool(name: string, rawInput: unknown): Promise<unknown> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) {
    throw new FocusError('NOT_FOUND', `Unknown tool: ${name}`);
  }
  const start = Date.now();
  let validated: unknown;
  try {
    validated = tool.inputSchema.parse(rawInput ?? {});
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const error = new FocusError('INVALID_INPUT', message);
    logToolCall({
      timestamp: new Date(start).toISOString(),
      tool: name,
      input: rawInput,
      duration_ms: Date.now() - start,
      error: { code: error.code, message: error.message },
    });
    throw error;
  }

  try {
    const output = await tool.handler(validated);
    logToolCall({
      timestamp: new Date(start).toISOString(),
      tool: name,
      input: rawInput,
      output_summary: summarizeOutput(output),
      duration_ms: Date.now() - start,
    });
    return output;
  } catch (err) {
    const error =
      err instanceof FocusError
        ? err
        : new FocusError('IO_ERROR', err instanceof Error ? err.message : String(err));
    logToolCall({
      timestamp: new Date(start).toISOString(),
      tool: name,
      input: rawInput,
      duration_ms: Date.now() - start,
      error: { code: error.code, message: error.message },
    });
    throw error;
  }
}
