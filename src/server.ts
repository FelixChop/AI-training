#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { getDb } from './db/client.js';
import { FocusError } from './models/status.js';
import { callTool, toolListForMcp } from './tools/index.js';
import { checkForUpdatesTool } from './tools/updates.js';
import { VERSION } from './version.js';

async function main(): Promise<void> {
  // Trigger DB open + migrations early so we fail loud on bad state.
  getDb();

  const server = new Server({ name: 'focus', version: VERSION }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: toolListForMcp(),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      const result = await callTool(name, args ?? {});
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      const focusErr =
        err instanceof FocusError
          ? err
          : new FocusError('IO_ERROR', err instanceof Error ? err.message : String(err));
      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              { code: focusErr.code, message: focusErr.message, details: focusErr.details },
              null,
              2,
            ),
          },
        ],
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Fire-and-forget background update check. Errors are swallowed.
  checkForUpdatesTool().catch(() => undefined);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`focus fatal error: ${message}\n`);
  process.exit(1);
});
