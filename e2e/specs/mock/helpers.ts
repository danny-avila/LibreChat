import { expect } from '@playwright/test';
import type { Page, Response } from '@playwright/test';

/** Substring of the reply emitted by the mock LLM server. */
export const MOCK_REPLY_TEXT = 'E2E mock reply';

/** Custom endpoints defined in e2e/config/librechat.e2e.yaml. */
export const MOCK_ENDPOINTS = [
  { label: 'Mock Provider A', model: 'mock-model-a' },
  { label: 'Mock Provider B', model: 'mock-model-b' },
] as const;

export type MockEndpoint = (typeof MOCK_ENDPOINTS)[number];

export const NEW_CHAT_PATH = '/c/new';

export function isAgentsStream(response: Response) {
  return response.url().includes('/api/agents') && response.status() === 200;
}

const modelSelectorTrigger = (page: Page) =>
  page.getByRole('button', { name: 'Select a model' }).first();

/** Open the model selector, choose an endpoint, then its model (committed on the model click). */
export async function selectMockEndpoint(page: Page, endpoint: MockEndpoint) {
  await modelSelectorTrigger(page).click();
  await page.getByRole('option', { name: endpoint.label }).click();
  await page.getByRole('option', { name: endpoint.model, exact: true }).click();
  await expect(modelSelectorTrigger(page)).not.toHaveText('Select a model');
}

/** Enable the ephemeral Skills capability from the composer tool menu. */
export async function enableSkills(page: Page) {
  await page.getByRole('button', { name: 'Tools Options' }).click();
  await page.getByTestId('tools-menu-skills').click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Skills' })).toBeVisible();
}

/** The mock reply as rendered in the conversation, scoped to the messages view. */
export function mockReply(page: Page) {
  return page.getByTestId('messages-view').getByText(new RegExp(MOCK_REPLY_TEXT, 'i'));
}

/** Type a message, send it, and wait for the streamed `/api/agents` response. */
export async function sendMessage(page: Page, text: string): Promise<Response> {
  const input = page.getByRole('textbox', { name: 'Message input' });
  await input.click();
  await input.fill(text);
  const [response] = await Promise.all([
    page.waitForResponse(isAgentsStream, { timeout: 30000 }),
    input.press('Enter'),
  ]);
  return response;
}
