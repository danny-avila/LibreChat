import { expect, test } from '@playwright/test';
import type { Page, Response } from '@playwright/test';
import { cleanupAgent, uniqueAgentName } from '../mock/agents.helpers';
import {
  NEW_CHAT_PATH,
  getAccessToken,
  mockReply,
  requestJson,
  messagesView,
} from '../mock/helpers';

type StartupConfigResponse = {
  modelSpecs?: {
    enforce?: boolean;
  };
};

type AgentResponse = {
  id: string;
  name?: string | null;
};

const modelTrigger = (page: Page) => page.getByRole('button', { name: 'Select a model' }).first();

async function createAgent(page: Page, name: string): Promise<AgentResponse> {
  const token = await getAccessToken(page);
  return requestJson<AgentResponse>(page, {
    path: '/api/agents',
    token,
    method: 'POST',
    body: {
      name,
      provider: 'Mock Provider A',
      model: 'mock-model-a',
      model_parameters: {},
    },
  });
}

async function selectAgent(page: Page, agentName: string) {
  const trigger = modelTrigger(page);
  await trigger.click();
  await page.getByRole('option', { name: 'My Agents' }).click();
  await page.getByRole('option', { name: agentName }).click();
  await expect(trigger).toContainText(agentName);
}

async function sendMessageAndAwaitAgentResponse(page: Page, text: string): Promise<Response> {
  const input = page.getByRole('textbox', { name: 'Message input' });
  await input.click();
  await input.fill(text);
  const [response] = await Promise.all([
    page.waitForResponse(
      (streamResponse) => {
        const { pathname } = new URL(streamResponse.url());
        return (
          streamResponse.request().method() === 'POST' &&
          pathname.startsWith('/api/agents/chat/') &&
          !pathname.endsWith('/abort')
        );
      },
      { timeout: 30000 },
    ),
    input.press('Enter'),
  ]);
  return response;
}

test.describe('model specs enforcement and saved agents', () => {
  test('allows saved agents to chat without a request-level model spec', async ({ page }) => {
    test.setTimeout(120000);

    const agentName = uniqueAgentName('E2E Enforced Agent');
    let createdAgentId: string | undefined;

    try {
      await page.goto(NEW_CHAT_PATH, { timeout: 10000 });

      const token = await getAccessToken(page);
      const startupConfig = await requestJson<StartupConfigResponse>(page, {
        path: '/api/config',
        token,
      });
      expect(startupConfig.modelSpecs?.enforce).toBe(true);

      const createdAgent = await createAgent(page, agentName);
      createdAgentId = createdAgent.id;

      await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
      await selectAgent(page, agentName);

      const response = await sendMessageAndAwaitAgentResponse(
        page,
        `hello from ${agentName} with enforced specs`,
      );
      expect(response.ok()).toBeTruthy();

      await expect(mockReply(page)).toBeVisible({ timeout: 30000 });
      await expect(messagesView(page).getByText('No model spec selected')).toHaveCount(0);
    } finally {
      await cleanupAgent(page, createdAgentId);
    }
  });
});
