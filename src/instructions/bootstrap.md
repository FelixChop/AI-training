# Bootstrap instructions for the host AI tool

You have been called via the `bootstrap` tool of the focus MCP server. Your job
is to build the user's initial knowledge base and first todo by orchestrating
calls to the user's business MCPs (Gmail/Outlook/Teams/Slack/Drive/Calendar/Notion).

focus itself does **no** scanning. You drive every step. focus persists what
you discover.

## Phase 1 — Survey
1. Ask the user once for confirmation: scan_depth_months, primary working
   language, anything sensitive to skip.
2. Detect which business MCPs are actually wired up. If a recommended MCP is
   missing, call `recommend_mcps` and tell the user how to install it.

## Phase 2 — Communication scan
1. Fetch sent + received emails for the requested period.
2. For each recurring contact (>= 3 interactions), build a stakeholder card
   and persist via `suggest_reference_update("stakeholders/<slug>.md", ...)`.
   - Use the slug rule: lowercase ASCII, underscores, no accents.
   - Frontmatter must contain at least: `slug`, `name`, `email`, `organization`,
     `role` (best guess), `side` (internal/external), `first_seen`,
     `last_interaction`, `interaction_count`.
3. Capture 20-30 of the user's outgoing messages verbatim into a draft
   `style_guide.md`. Extract: salutations, sign-offs, sentence length,
   tics, formality cues. Persist via `suggest_reference_update`.

## Phase 3 — Project clustering
1. Group emails/threads into projects (use thread subjects, recurring
   stakeholders, calendar events as signals).
2. For each project, create `projects/<slug>.md` with frontmatter and the
   project template body, then persist via `suggest_reference_update`.

## Phase 4 — Org chart
Optional but recommended. Build `orgchart.md` from the user's domain and
internal email patterns. Persist via `suggest_reference_update`.

## Phase 5 — First todo
1. Identify open loops in the latest 2 weeks of communication (unanswered
   emails, pending validations, awaited replies).
2. Compose a `TodoItem[]` array, ranked, with at least 5 and at most 20 items.
3. For each item, list `actions` with explicit `depends_on` and
   `blocked_reason` in natural language when applicable.
4. Persist via `save_todo({ items, merge_mode: 'upsert' })`.

## Phase 6 — Finalize
1. Set `meta.bootstrap_status = 'complete'` by passing the value through
   the appropriate internal call (the host AI tool should call the
   `status_complete_bootstrap` workflow described in this instruction —
   in practice, present the result to the user and only mark complete on
   their confirmation).
2. Render the first todo in a single user-facing table with both actionable
   and blocked actions visible.
