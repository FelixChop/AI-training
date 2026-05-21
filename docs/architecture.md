# Architecture

focus is a stdio MCP server in TypeScript. It binds to no port. It runs
inside the process spawned by your AI tool, lives for the duration of the
session, and stores everything under `~/.focus/`.

## Data flow

```
   ┌────────────────────┐
   │   Your AI tool     │  (Claude, ChatGPT, ...)
   │   (the brain)      │
   └─────────┬──────────┘
             │ MCP (stdio: JSON-RPC over stdin/stdout)
             ▼
   ┌────────────────────┐
   │    focus server    │   12 tools, no LLM, no network*
   └─────┬───────┬──────┘
         │       │
         ▼       ▼
   ┌────────┐ ┌─────────────────────┐
   │ SQLite │ │  ~/.focus/reference │
   │ todo   │ │  (markdown cards)   │
   └────────┘ └─────────────────────┘

   * Single exception: check_for_updates → api.github.com
```

## Layers

- **Transport** (`src/server.ts`): stdio JSON-RPC via
  `@modelcontextprotocol/sdk`. Maps `tools/list` and `tools/call` to the
  tool registry.
- **Registry** (`src/tools/index.ts`): 12 tools, each with a Zod input
  schema, a handler, and a logging wrapper.
- **Tools** (`src/tools/`): bootstrap, references, todo (claim/release/
  mark/save/get), catalog, updates.
- **Persistence** (`src/db/`, `src/utils/files.ts`): SQLite via
  `better-sqlite3` (one DB, two tables: `todo_items`, `meta`) + atomic
  markdown writes with `proper-lockfile`.
- **Models** (`src/models/`): `TodoItem`, `Action`, `Source`, error codes.
- **Static assets** (`src/templates/`, `src/instructions/`,
  `src/catalog/mcps.yaml`): templates copied to user space on first use,
  instructions returned by `bootstrap`, MCP catalog returned by
  `recommend_mcps`.

## Cross-cutting

- **Concurrency**: SQLite transactions on the critical path
  (`claim_item`, `mark_action_status`, `save_todo`). `proper-lockfile`
  around markdown writes. Multiple conversations can run against the same
  focus instance — that's why `claim_item` exists.
- **Migrations**: linear, versioned in `src/db/migrations.ts`. Run on
  every start. The current code version is compared against
  `meta.schema_version` and rejected if the DB is newer.
- **Logging**: JSONL in `~/.focus/logs/tools.log` (one line per tool
  call) and `~/.focus/logs/bootstrap.log`. Inputs are truncated to keep
  sensitive content out of disk.
- **Errors**: structured `FocusError` with codes `TASK_LOCKED`,
  `NOT_FOUND`, `BOOTSTRAP_INCOMPLETE`, `INVALID_INPUT`, `IO_ERROR`,
  `MIGRATION_REQUIRED`. The error object is what your AI sees on
  failures.
- **Security**: paths are validated to stay under `~/.focus/`. No
  arbitrary code execution. No outbound HTTP except the GitHub Releases
  ping.

## Testing

`vitest` with one shared in-memory-ish test setup: each test gets a fresh
`FOCUS_HOME` (via env), the DB cache is reset between tests. Coverage
spans the DB layer, locks, the merge logic of `save_todo`, the cascade
of `mark_action_status`, the tool registry, and one end-to-end
integration scenario.
