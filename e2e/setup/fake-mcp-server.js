#!/usr/bin/env node

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const z = require('zod/v4');

const server = new McpServer({
  name: 'e2e-memory',
  version: '1.0.0',
});

server.registerTool(
  'remember_fact',
  {
    description: 'Stores a deterministic fact for LibreChat mock end-to-end tests.',
    inputSchema: {
      fact: z.string().optional(),
    },
  },
  async ({ fact = 'LibreChat MCP e2e fact' }) => ({
    content: [
      {
        type: 'text',
        text: `E2E MCP memory noted: ${fact}`,
      },
    ],
  }),
);

server.registerTool(
  'recall_fact',
  {
    description: 'Returns a deterministic fact for LibreChat mock end-to-end tests.',
    inputSchema: {},
  },
  async () => ({
    content: [
      {
        type: 'text',
        text: 'E2E MCP memory recalled: LibreChat can persist MCP tools on agents.',
      },
    ],
  }),
);

server.registerTool(
  'slow_echo',
  {
    description:
      'Echoes text after a delay; used to verify background tool dispatch in mock e2e tests.',
    inputSchema: {
      text: z.string(),
      delay_ms: z.number().optional(),
    },
  },
  async ({ text, delay_ms = 1500 }) => {
    await new Promise((resolve) => setTimeout(resolve, delay_ms));
    return {
      content: [
        {
          type: 'text',
          text: `E2E slow echo: ${text}`,
        },
      ],
    };
  },
);

async function main() {
  await server.connect(new StdioServerTransport());
}

main().catch((error) => {
  console.error('[fake-mcp-server] failed to start', error);
  process.exit(1);
});
