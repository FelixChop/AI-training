# Bootstrap instructions for the host AI tool

You have been called via the `bootstrap` tool of the focus MCP server. Your job
is to build the user's initial knowledge base and first todo by orchestrating
calls to the user's business MCPs (Gmail/Outlook/Teams/Slack/Drive/Calendar/Notion).

focus itself does **no** scanning. You drive every step. focus persists what
you discover and tracks how far you have progressed.

## Step 0 — Confirm scope with the user

Ask once for: `scan_depth_months` (default 1), primary working language, and
anything sensitive to skip.

## Step 1 — Pull the structured scan plan

Call `get_scan_plan({ scan_depth_months })`. This returns a `phases` array of
7 phases (sent emails scan, received emails scan, stakeholder extraction,
style guide, project clustering, org chart, initial todo). Each phase has:

- `id` and `name` (e.g. `p3`, `stakeholder_extraction`)
- `tool_hint` — which business MCP capability to use
- `params_hint` — the shape of the parameters to pass
- `goal` — what success looks like
- `batch_size_hint` — how many items to process before purging your context
- `depends_on` — phase ids that must be complete first

`get_scan_plan` is idempotent: if a plan is already in progress, calling it
again returns the same plan unchanged.

## Step 2 — Detect available business MCPs

If a recommended MCP is missing, call `recommend_mcps` and tell the user how
to install it. Adapt each phase's `tool_hint` to whichever MCP is actually
installed (e.g. use `outlook.list_messages` if Gmail isn't wired up).

## Step 3 — Execute each phase in order

For each phase whose `depends_on` is satisfied:

1. Execute the phase's `tool_hint` with parameters shaped like `params_hint`.
2. Process results in batches of `batch_size_hint`.
3. After each batch, call
   `update_scan_progress({ phase_id, items_processed_delta: <N> })`. This
   lets focus track progress without holding the data in its memory.
4. When the phase's goal is met, call
   `update_scan_progress({ phase_id, mark_complete: true })`. focus advances
   `current_phase_id` to the next eligible phase.

### Writing into the knowledge base

During the scan, persist insights using:

- `suggest_reference_update({ path: 'stakeholders/<slug>.md', ... })`
- `suggest_reference_update({ path: 'projects/<slug>.md', ... })`
- `suggest_reference_update({ path: 'style_guide.md', ... })`
- `suggest_reference_update({ path: 'orgchart.md', ... })`

While `bootstrap_status === 'in_progress'`, these writes are applied directly
(no pending phase). Frontmatter must follow SPEC §5.4 (slug, name, email,
organization, role, side, first_seen, last_interaction, interaction_count
for stakeholders).

## Step 4 — Persist the initial todo

In phase `p7`, compose a `TodoItem[]` array (5-20 items, ranked) with explicit
`actions` and `depends_on`. Persist via `save_todo({ items, merge_mode: 'upsert' })`.

## Step 5 — Auto-completion

When you mark the **last** phase complete, focus automatically sets
`bootstrap_status` to `complete` and stamps `last_bootstrap_at`. You don't
need to call any extra "finalize" tool. Confirm with the user by showing the
first todo and a short recap of what the scan found.

## If a session ends mid-scan

The next session must call `resume_bootstrap()` first. It returns:

- the `current_phase` to work on,
- the ids of `completed_phase_ids`,
- the cumulative `items_processed`,
- short narrative `instructions` of what to do next.

`resume_bootstrap` is read-only. It never modifies state. Use it to ground the
next session before resuming the scan loop.

Calling `bootstrap(...)` again when a plan is already in progress also returns
resume data — both entry points are safe to call repeatedly.
