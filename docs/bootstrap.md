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
2. focus: returns instructions + recommended steps, sets state to
   `in_progress`.
3. Your AI tool: pulls sent + received emails, builds stakeholder cards,
   captures 20-30 of your own messages for the style guide, clusters
   threads into projects, drafts the first todo.
4. Each card is persisted via `suggest_reference_update`. During bootstrap,
   focus accepts writes directly (no `.pending.md` step).
5. The first todo is persisted via `save_todo`.
6. Your AI presents the result to you for review.
7. You confirm, focus marks `bootstrap_status: complete`.

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
