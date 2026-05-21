# Install

focus is a single npm package. No Docker, no Python, no native build steps
beyond `better-sqlite3` (which compiles a small SQLite native module on
install — pre-built for most platforms).

## Requirements

- Node.js ≥ 20
- macOS, Linux, or Windows
- About 50 MB free in `~/.focus/`

## Add focus to your AI tool

### Claude Desktop / Claude Code

Edit your MCP config (Claude Desktop: `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS, `%APPDATA%\Claude\claude_desktop_config.json` on Windows).

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

For Claude Code, run:
```bash
claude mcp add focus -- npx -y @felixchop/focus
```

### ChatGPT (desktop) and others

Any MCP-aware tool that supports stdio servers accepts the same config
shape. Point your tool at `npx -y @felixchop/focus`.

### Claude iOS

Not supported in v0.1 (iOS only accepts remote HTTP MCP servers). The HTTP
transport is on the roadmap.

## First run

The first time your AI tool launches focus, the server creates
`~/.focus/` and a fresh SQLite database. Migrations run automatically on
every start.

Confirm it works by asking your AI tool:

> *"Run focus status and tell me what you see."*

You should see `bootstrap_status: not_started`. From there, ask it to
bootstrap.

## Updating

focus tells you when a new version is out via `check_for_updates`. To
update:

```bash
npm install -g @felixchop/focus@latest
```

or rely on `npx -y` always fetching the latest tag.
