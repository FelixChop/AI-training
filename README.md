# focus

> Your AI tool, turned into a true chief of staff. Local. Private. Open source.

**focus** is a local MCP (Model Context Protocol) server that turns any
agentic AI tool — Claude, ChatGPT, Gemini, Mistral, Copilot, OpenCode — into
your personal chief of staff. It builds a private knowledge base of your
stakeholders, projects and writing style, then helps your AI generate and
execute a prioritised todo on your behalf.

focus contains **no AI**. The intelligence comes from your AI tool. focus is
the plumbing: a SQLite store for the operational todo, plain-markdown files
for the knowledge base, and a small set of MCP tools your AI can call.

---

## Quickstart

Add focus to your AI tool's MCP configuration:

```json
{
  "mcpServers": {
    "focus": {
      "command": "npx",
      "args": ["-y", "@felixchop/focus"]
    }
  }
}
```

Then, in your AI tool, say:

> *"Bootstrap focus by scanning the last month of my communications."*

Your AI will pick up from there, build your knowledge base, and present
your first prioritised todo. Plan for 10-30 minutes for the initial scan,
depending on `scan_depth_months`.

---

## What you get

- `~/.focus/focus.db` — your todo, locally on your machine, nowhere else.
- `~/.focus/reference/` — plain-markdown cards for stakeholders, projects,
  your writing style, your objectives, and your org chart. You can read
  and edit these files directly with any editor.
- 12 MCP tools your AI tool can call to enrich and act on these.

---

## Supported AI tools

focus is tool-agnostic. Anything that speaks MCP works.

| Tool        | Status        | Transport |
| ----------- | ------------- | --------- |
| Claude (Desktop / Code) | ✅ Supported | stdio |
| ChatGPT     | ✅ Supported  | stdio (via desktop MCP bridge) |
| Gemini CLI  | ✅ Supported  | stdio |
| Mistral     | ✅ Supported  | stdio |
| GitHub Copilot (CLI/IDE) | ✅ Supported | stdio |
| OpenCode    | ✅ Supported  | stdio |
| Claude iOS  | ⚠️ Not in v1  | requires HTTP transport — on the roadmap |

> v0.1 is stdio-only. Remote/iOS support requires the HTTP transport (planned).

---

## Recommended business MCPs

focus orchestrates these. None are bundled — you install them separately
on your AI tool, and focus discovers what's available.

- **Gmail** / **Outlook** — email scanning and sending
- **Microsoft Teams** / **Slack** — chat scanning and sending
- **Google Calendar** — meeting context
- **Google Drive** / **Notion** / **Confluence** — document context

Call `recommend_mcps` from your AI tool to get the up-to-date install URLs.

---

## The 12 tools

| Tool | What it does |
|---|---|
| `status` | Returns bootstrap state, todo count, KB summary, version |
| `bootstrap` | Kicks off the initial scan — returns instructions for your AI |
| `list_references` | Lists `.md` cards in `~/.focus/reference/` |
| `read_reference` | Reads a card with frontmatter + body |
| `suggest_reference_update` | Proposes a write to a card (applied during bootstrap, pending otherwise) |
| `save_todo` | Upserts todo items, preserving statuses already advanced |
| `get_current_todo` | Returns the current todo |
| `claim_item` | Locks an item for one conversation (TTL) |
| `release_item` | Releases a lock |
| `mark_action_status` | Updates an action — cascades to unblock dependents |
| `recommend_mcps` | Returns the catalog of recommended business MCPs |
| `check_for_updates` | Polls GitHub Releases for newer versions of focus |

See [`SPEC.md`](./SPEC.md) for full contracts.

---

## Principles

- **Full local.** Your data never leaves your machine. The only outbound
  call is `check_for_updates` to GitHub.
- **Always validable.** focus never sends emails or messages on its own.
  It proposes, your AI drafts, you approve.
- **No silent deletes.** Actions and items are kept around; statuses
  evolve, history is preserved.

---

## Documentation

- [`docs/install.md`](./docs/install.md) — installation per AI tool
- [`docs/bootstrap.md`](./docs/bootstrap.md) — how the initial scan works
- [`docs/architecture.md`](./docs/architecture.md) — what lives where
- [`SPEC.md`](./SPEC.md) — full specification
- [`CHANGELOG.md`](./CHANGELOG.md) — release notes

---

## Bootcamp

Want focus deployed on your infrastructure with custom workflows?
[See the 5-day bootcamp.](https://felixrevert.fr)

---

## License

MIT. See [`LICENSE`](./LICENSE).
