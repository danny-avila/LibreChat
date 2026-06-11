import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { MOCK_ENDPOINTS, NEW_CHAT_PATH, fetchJson, getAccessToken, requestJson } from './helpers';

export const AGENT_EDIT_PERMISSION = 2;

export type AgentSummary = {
  _id: string;
  id: string;
  name?: string;
  description?: string;
  provider: string;
  model: string;
  category?: string;
};

export type ModelParameters = {
  maxContextTokens?: number;
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  thinkingBudget?: number;
  fileTokenLimit?: number;
  resendFiles?: boolean;
  promptCache?: boolean;
  thinking?: boolean;
  web_search?: boolean;
};

export type AgentDetail = AgentSummary & {
  instructions?: string;
  model_parameters?: ModelParameters;
  tools?: string[];
  mcpServerNames?: string[];
};

export const uniqueAgentName = (prefix: string) =>
  `${prefix} ${Date.now()}-${Math.floor(Math.random() * 1e4)}`;

export async function findAgent(
  page: Page,
  agentName: string,
  token: string,
): Promise<AgentSummary | null> {
  const body = await fetchJson<{ data?: AgentSummary[] }>(
    page,
    `/api/agents?search=${encodeURIComponent(agentName)}&limit=10&requiredPermission=${AGENT_EDIT_PERMISSION}`,
    token,
  );
  return body.data?.find((agent) => agent.name === agentName) ?? null;
}

export async function waitForPersistedAgent(
  page: Page,
  agentName: string,
  description: string,
): Promise<AgentDetail> {
  const token = await getAccessToken(page);
  let latestAgent: AgentDetail | null = null;

  for (let attempt = 0; attempt < 20; attempt++) {
    const agent = await findAgent(page, agentName, token);
    if (agent) {
      latestAgent = await fetchJson<AgentDetail>(
        page,
        `/api/agents/${encodeURIComponent(agent.id)}/expanded`,
        token,
      );
      if (latestAgent.description === description) {
        return latestAgent;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  expect(latestAgent, `Expected agent "${agentName}" to be persisted`).not.toBeNull();
  expect(latestAgent?.description).toBe(description);
  return latestAgent!;
}

export async function openAgentBuilder(page: Page) {
  await page.goto(NEW_CHAT_PATH, { timeout: 10000 });

  const form = page.getByRole('form', { name: 'Agent configuration form' });
  const builderVisible = await form
    .waitFor({ state: 'visible', timeout: 1000 })
    .then(() => true)
    .catch(() => false);
  if (!builderVisible) {
    const agentBuilderButton = page.getByRole('button', { name: 'Agent Builder' });
    await expect(agentBuilderButton).toBeVisible();
    if ((await agentBuilderButton.getAttribute('aria-pressed')) !== 'true') {
      await agentBuilderButton.click();
    }
  }
  await expect(form).toBeVisible();
  return form;
}

export async function selectMockModel(page: Page, clickBackToBuilder = false) {
  const form = page.getByRole('form', { name: 'Agent configuration form' });

  await form.locator('label[for="provider"] + button').click();
  await expect(form.getByText('Model Parameters', { exact: true })).toBeVisible();

  await form.getByRole('combobox', { name: 'Provider' }).click();
  await page.getByRole('option', { name: MOCK_ENDPOINTS[0].label }).click();

  await form.getByRole('combobox', { name: 'Model' }).click();
  await page.getByRole('option', { name: MOCK_ENDPOINTS[0].model, exact: true }).click();

  if (clickBackToBuilder) {
    await form.getByRole('button', { name: 'Back to builder' }).click();
    await expect(page.getByRole('form', { name: 'Agent configuration form' })).toBeVisible();
  }
}

export async function cleanupAgent(page: Page, agentId?: string) {
  if (!agentId) {
    return;
  }

  const token = await getAccessToken(page);
  await requestJson<{ message?: string }>(page, {
    path: `/api/agents/${encodeURIComponent(agentId)}`,
    token,
    method: 'DELETE',
  });
}
