import { expect, request as playwrightRequest, test } from '@playwright/test';
import type { AgentDetail } from './agents.helpers';
import cleanupUser from '../../setup/cleanupUser';
import { cleanupAgent, openAgentBuilder, uniqueAgentName } from './agents.helpers';
import {
  MOCK_ENDPOINTS,
  NEW_CHAT_PATH,
  getAccessToken,
  messagesView,
  requestJson,
  sendMessageAndWaitForCompletion,
} from './helpers';

const CODE_VALUE = 'librechat-bridge-persisted';

interface PairingResponse {
  environmentId: string;
  workerId: string;
  code: string;
  expiresAt: string;
}

interface RegisteredEnvironment {
  resourceId: string;
  id: string;
  name: string;
  type: 'attached';
}

test.describe('attached stateful code environment', () => {
  test.skip(!process.env.E2E_CODE_BRIDGE_URL, 'E2E_CODE_BRIDGE_URL is required');

  test('routes two conversation turns through the bridge and preserves workspace state', async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.goto(NEW_CHAT_PATH, { timeout: 15000 });

    const name = uniqueAgentName('E2E Attached Code Agent');
    let agentId: string | undefined;
    const stranger = {
      email: `code-bridge-stranger-${Date.now()}@example.com`,
      name: 'Code Bridge Stranger',
      password: 'securepassword123',
    };

    try {
      const token = await getAccessToken(page);
      if (process.env.E2E_CODE_BRIDGE_ADMIN_TOKEN) {
        const pairing = await requestJson<PairingResponse>(page, {
          path: '/api/admin/code-environments/e2e-vm/pairings',
          token,
          method: 'POST',
        });
        expect(pairing).toMatchObject({
          environmentId: 'e2e-vm',
          workerId: 'e2e-vm',
          code: expect.stringMatching(/^[A-Za-z0-9_-]{32}$/),
          expiresAt: expect.any(String),
        });
        expect(pairing).not.toHaveProperty('token');
        expect(Number.isFinite(Date.parse(pairing.expiresAt))).toBe(true);
      }
      const registration = await requestJson<{ environment: RegisteredEnvironment }>(page, {
        path: '/api/code-environments',
        token,
        method: 'POST',
        body: {
          name: 'E2E principal-owned VM',
          controlPlaneId: 'e2e-vm',
          /** Neither field is trusted by the server; keep them here as an E2E
           * regression check against client-selected routing. */
          workerId: 'attacker-worker',
          baseURL: 'https://attacker.invalid',
        },
      });
      expect(registration.environment).toMatchObject({
        resourceId: expect.any(String),
        id: expect.stringMatching(/^code-/),
        name: 'E2E principal-owned VM',
        type: 'attached',
      });
      expect(registration.environment).not.toHaveProperty('baseURL');
      expect(registration.environment).not.toHaveProperty('workerId');

      const ownerList = await requestJson<{ environments: RegisteredEnvironment[] }>(page, {
        path: '/api/code-environments',
        token,
      });
      expect(ownerList.environments).toContainEqual(registration.environment);

      await cleanupUser(stranger);
      const strangerApi = await playwrightRequest.newContext({
        baseURL: new URL(page.url()).origin,
        storageState: { cookies: [], origins: [] },
      });
      try {
        expect(
          (
            await strangerApi.post('/api/auth/register', {
              data: {
                email: stranger.email,
                name: stranger.name,
                password: stranger.password,
                confirm_password: stranger.password,
              },
            })
          ).ok(),
        ).toBe(true);
        const strangerLogin = await strangerApi.post('/api/auth/login', {
          data: { email: stranger.email, password: stranger.password },
        });
        expect(strangerLogin.ok()).toBe(true);
        const strangerToken = ((await strangerLogin.json()) as { token?: string }).token;
        expect(strangerToken).toEqual(expect.any(String));
        const strangerList = await strangerApi.get('/api/code-environments', {
          headers: { Authorization: `Bearer ${strangerToken}` },
        });
        expect(strangerList.ok()).toBe(true);
        expect(await strangerList.json()).toEqual({ environments: [] });
      } finally {
        await strangerApi.dispose();
        await cleanupUser(stranger);
      }

      const agent = await requestJson<AgentDetail>(page, {
        path: '/api/agents',
        token,
        method: 'POST',
        body: {
          name,
          description: 'Exercises the outbound stateful code bridge.',
          instructions: 'Use the requested code tool and report its output.',
          provider: MOCK_ENDPOINTS[0].label,
          model: MOCK_ENDPOINTS[0].model,
          tools: ['execute_code'],
          stateful_code_sessions: true,
          stateful_code_environment: 'conversation',
          code_environment_id: registration.environment.id,
        },
      });
      agentId = agent.id;

      const form = await openAgentBuilder(page);
      await form.getByRole('combobox', { name: 'Agent', exact: true }).click();
      await page.getByRole('option', { name }).click();
      await expect(form.getByLabel('Agent name')).toHaveValue(name);
      await form.getByRole('button', { name: 'Select Agent' }).click();

      await sendMessageAndWaitForCompletion(page, 'E2E_STATEFUL_CODE:write');
      await expect(
        messagesView(page).getByText(`E2E stateful code write observed ${CODE_VALUE}`),
      ).toBeVisible({ timeout: 30000 });

      await sendMessageAndWaitForCompletion(page, 'E2E_STATEFUL_CODE:read');
      await expect(
        messagesView(page).getByText(`E2E stateful code read observed ${CODE_VALUE}`),
      ).toBeVisible({ timeout: 30000 });
    } finally {
      await cleanupAgent(page, agentId);
    }
  });
});
