# Canonical scan plan

This document defines the 7 phases that `get_scan_plan` produces. Each phase is
a unit of work the host AI must execute by calling the appropriate business
MCP (gmail, outlook, teams, etc.), then report progress back to focus via
`update_scan_progress`.

The `tool_hint` is a **suggestion**: pick whichever installed MCP covers the
capability. The `params_hint` shows the **shape** of the call; adapt the query
syntax to the actual MCP in use.

## Phases

### p1 — sent_emails_scan
- Goal: fetch the user's outgoing messages so we can learn their style and
  weight stakeholders by how often the user reaches out.
- Tool hint: an email MCP search/list tool (e.g. `gmail.search_emails`,
  `outlook.list_messages`).
- Params hint shape: `{ query: "from:me after:<ISO>", max_results: 500 }`.
- Expected outputs: a corpus of sent messages, batched by `batch_size_hint`.
- depends_on: (none)

### p2 — received_emails_scan
- Goal: fetch incoming messages to identify recurring contacts and open loops.
- Tool hint: same family as p1 but inbound.
- Params hint shape: `{ query: "to:me after:<ISO>", max_results: 500 }`.
- Expected outputs: a corpus of received messages.
- depends_on: (none)

### p3 — stakeholder_extraction
- Goal: build one `stakeholders/<slug>.md` per recurring contact (>= 3
  interactions across p1 + p2).
- Tool hint: focus's `suggest_reference_update` (no business MCP needed at this
  phase — the data is already in-memory from p1 + p2).
- Params hint shape: see SPEC §5.4 for the stakeholder frontmatter.
- Expected outputs: stakeholder cards persisted; counter incremented per card.
- depends_on: [p1, p2]

### p4 — style_guide_build
- Goal: capture 20-30 of the user's own messages verbatim into
  `style_guide.md`, plus extracted rules (salutations, sign-offs, average
  length, formality).
- Tool hint: focus's `suggest_reference_update`.
- Params hint shape: `{ path: "style_guide.md", content: "<markdown>", ... }`.
- Expected outputs: one style_guide.md.
- depends_on: [p1]

### p5 — project_clustering
- Goal: cluster threads into projects and persist `projects/<slug>.md` per
  project, with frontmatter (status, key stakeholders, recent activity).
- Tool hint: focus's `suggest_reference_update`, possibly cross-checked with
  calendar events from a calendar MCP.
- Params hint shape: `{ path: "projects/<slug>.md", content: "<markdown>", ... }`.
- Expected outputs: project cards.
- depends_on: [p1, p2, p3]

### p6 — orgchart_build
- Goal: synthesise an `orgchart.md` from the user's internal-domain
  communication patterns. Optional but recommended.
- Tool hint: focus's `suggest_reference_update`.
- Params hint shape: `{ path: "orgchart.md", content: "<markdown>", ... }`.
- Expected outputs: orgchart.md (single file).
- depends_on: [p3]

### p7 — initial_todo_generation
- Goal: detect open loops in the last 2 weeks (unanswered emails, pending
  validations, awaited replies) and persist a first ranked todo.
- Tool hint: focus's `save_todo`.
- Params hint shape: `{ items: TodoItem[], merge_mode: 'upsert' }`.
- Expected outputs: between 5 and 20 todo items.
- depends_on: [p1, p2, p3, p5]

## Reporting protocol

After each batch within a phase, call
`update_scan_progress({ phase_id, items_processed_delta: N })`. At the end of a
phase, call `update_scan_progress({ phase_id, mark_complete: true })`.

If the session is interrupted (context window saturated, error, user closes
the chat), the next session must call `resume_bootstrap()` first to find out
which phase to resume.

When the last phase is marked complete, focus automatically sets
`bootstrap_status` to `complete`.
