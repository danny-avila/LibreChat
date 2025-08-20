// Integration tests for OAuth detection against real public MCP servers
// These tests verify the actual behavior against live endpoints
//
// DEVELOPMENT ONLY: This file is excluded from the test suite (.dev.ts extension)
// Use this for development and debugging OAuth detection behavior
//
// To run manually from packages/api directory:
//   npx jest --testMatch="**/detectOAuth.integration.dev.ts"

import { detectOAuthRequirement } from '~/mcp/oauth';

describe('OAuth Detection Integration Tests', () => {
  const NETWORK_TIMEOUT = 10000;

  interface TestServer {
    name: string;
    url: string;
    expectedOAuth: boolean;
    expectedMethod: string;
    withMeta: boolean;
  }

  const testServers: TestServer[] = [
    {
      name: 'GitHub Copilot MCP Server',
      url: 'https://api.githubcopilot.com/mcp',
      expectedOAuth: true,
      expectedMethod: '401-challenge-metadata',
      withMeta: true,
    },
    {
      name: 'GitHub API (401 without metadata)',
      url: 'https://api.github.com/user',
      expectedOAuth: true,
      expectedMethod: 'no-metadata-found',
      withMeta: false,
    },
    {
      name: 'Stytch Todo MCP Server',
      url: 'https://mcp-stytch-consumer-todo-list.maxwell-gerber42.workers.dev',
      expectedOAuth: true,
      expectedMethod: 'protected-resource-metadata',
      withMeta: true,
    },
    {
      name: 'HTTPBin (Non-OAuth)',
      url: 'https://httpbin.org',
      expectedOAuth: false,
      expectedMethod: 'no-metadata-found',
      withMeta: false,
    },
    {
      name: 'Unreachable Server',
      url: 'https://definitely-not-a-real-server-12345.com',
      expectedOAuth: false,
      expectedMethod: 'no-metadata-found',
      withMeta: false,
    },
  ];

  describe('detectOAuthRequirement integration', () => {
    testServers.forEach((server) => {
      it(
        `should handle ${server.name}`,
        async () => {
          const result = await detectOAuthRequirement(server.url);

          expect(result.requiresOAuth).toBe(server.expectedOAuth);
          expect(result.method).toBe(server.expectedMethod);
          expect(result.metadata == null).toBe(!server.withMeta);
        },
        NETWORK_TIMEOUT,
      );
    });
  });
});
