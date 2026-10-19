import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { getE2EUser } from '../../../setup/user';

type ModelRow = { id: string; name?: string; description?: string; provider?: string };

async function login(request: APIRequestContext): Promise<string> {
  const { email, password } = getE2EUser();
  const response = await request.post('/api/auth/login', { data: { email, password } });
  expect(response.ok()).toBeTruthy();
  return ((await response.json()) as { token: string }).token;
}

async function createAgent(request: APIRequestContext, token: string, name: string) {
  const response = await request.post('/api/agents', {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      name,
      description: 'Listed by the remote models route.',
      provider: 'Mock Provider A',
      model: 'mock-model-a',
      model_parameters: {},
      tools: [],
    },
  });
  expect(response.status()).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

for (const [label, path, scenario] of [
  ['chat completions', '/api/agents/v1/models', 'remote-models-list-shows-agent-details'],
  [
    'responses',
    '/api/agents/v1/responses/models',
    'remote-responses-models-list-shows-agent-details',
  ],
] as const) {
  test(`the ${label} models list shows the caller's agent with its details @scenario:${scenario}`, async ({
    playwright,
    baseURL,
  }) => {
    const request = await playwright.request.newContext({ baseURL });
    let agentId = '';
    let token = '';
    try {
      token = await login(request);
      const name = `Models list ${randomUUID().slice(0, 8)}`;
      agentId = await createAgent(request, token, name);

      const response = await request.get(path, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(response.status()).toBe(200);
      const { data } = (await response.json()) as { data: ModelRow[] };

      expect(data.find((row) => row.id === agentId)).toMatchObject({
        id: agentId,
        name,
        description: 'Listed by the remote models route.',
        provider: 'Mock Provider A',
      });
    } finally {
      if (agentId) {
        await request.delete(`/api/agents/${agentId}`, {
          headers: { Authorization: `Bearer ${token}` },
          failOnStatusCode: false,
        });
      }
      await request.dispose();
    }
  });
}
