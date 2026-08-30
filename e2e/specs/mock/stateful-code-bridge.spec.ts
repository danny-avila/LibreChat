import { expect, test } from '@playwright/test';
import type { AgentDetail } from './agents.helpers';
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

test.describe('attached stateful code environment', () => {
  test.skip(!process.env.E2E_CODE_BRIDGE_URL, 'E2E_CODE_BRIDGE_URL is required');

  test('routes two conversation turns through the bridge and preserves workspace state', async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.goto(NEW_CHAT_PATH, { timeout: 15000 });

    const name = uniqueAgentName('E2E Attached Code Agent');
    let agentId: string | undefined;

    try {
      const token = await getAccessToken(page);
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
          code_environment_id: 'e2e-vm',
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
