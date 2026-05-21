# Bootstrap

The first time you use focus, your AI tool runs a `bootstrap` to learn
your context. focus itself does no scanning — it tells the AI what to do,
and the AI orchestrates calls to your business MCPs (Gmail, Outlook, Teams,
etc.).

## What you need before bootstrapping

- At least one business MCP installed and authenticated in your AI tool.
  Email is the highest-value: Gmail or Outlook.
- A few minutes (or up to 30, for deep scans) of your AI tool's attention.

## How it goes

1. You: *"Bootstrap focus for the last month."*
2. focus: returns instructions + points the AI to `get_scan_plan`, sets
   state to `in_progress`.
3. Your AI tool calls `get_scan_plan(1)` and receives a 7-phase plan:
   - `p1` sent emails scan
   - `p2` received emails scan
   - `p3` stakeholder extraction
   - `p4` style guide build
   - `p5` project clustering
   - `p6` org chart build
   - `p7` initial todo generation
4. For each phase, the AI calls the suggested business MCP (gmail,
   outlook…) in batches, reports `update_scan_progress` after each batch,
   and marks the phase complete when done.
5. Cards are persisted along the way via `suggest_reference_update`.
   During bootstrap, focus accepts writes directly (no `.pending.md` step).
6. The first todo is persisted in `p7` via `save_todo`.
7. When the last phase is marked complete, focus auto-sets
   `bootstrap_status: complete` and stamps `last_bootstrap_at`.

### If the session is interrupted

Deep scans (12+ months, thousands of messages) can saturate your AI's
context window and fail mid-flight. Not a problem: open a new conversation
and your AI calls `resume_bootstrap()` first. focus returns the current
phase, what's been done, and a short briefing. The scan resumes where it
stopped.

## How long does it take?

- `scan_depth_months: 1` — typically 5-10 minutes
- `scan_depth_months: 3` — typically 15-25 minutes
- `scan_depth_months: 12` or more — 30+ minutes, depending on volume

Volume of communications matters more than the time window.

## What focus stores

After bootstrap, expect to see in `~/.focus/reference/`:

- `objectives.md` — your high-level goals (lightly filled, you edit it)
- `orgchart.md` — your team and key stakeholders
- `style_guide.md` — observed tone, salutations, sign-offs + few-shot
  examples
- `stakeholders/*.md` — one card per recurring contact (≥ 3 interactions)
- `projects/*.md` — one card per identified project

All of these are plain markdown with a small YAML frontmatter. Edit them
in any editor whenever you want.

## What if I want to redo it?

Delete `~/.focus/focus.db` and the relevant `.md` files, or just ask your
AI tool to *"refresh stakeholder cards for the last 3 months"*. The
`suggest_reference_update` tool will land changes as `.pending.md` outside
bootstrap mode, so nothing is overwritten without you knowing.

## What focus never does

- Send a message on your behalf.
- Cache anything outside `~/.focus/`.
- Phone home anywhere except `api.github.com` for version checks.
