import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  NEW_CHAT_PATH,
  getAccessToken,
  mockReply,
  requestJson,
  selectModelSpec,
  sendMessage,
} from './helpers';

/** Label of the `softDefault: true` spec in e2e/config/librechat.e2e.yaml. */
const SOFT_DEFAULT_LABEL = 'E2E Soft Default';

/** Ephemeral endpoint from e2e/config/librechat.e2e.yaml with no mirroring spec. */
const EPHEMERAL_ENDPOINT = { label: 'Mock Provider C', model: 'mock-model-c' };

const uniqueName = (prefix: string) => `${prefix} ${Date.now()}-${Math.floor(Math.random() * 1e4)}`;

const modelTrigger = (page: Page) => page.getByRole('button', { name: 'Select a model' }).first();

/** Reset selection state so the test starts as a fresh instance (auth stays in cookies). */
async function startFresh(page: Page) {
  await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
  await page.evaluate(() => localStorage.clear());
  await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
}

type AgentResponse = {
  id: string;
  name?: string | null;
};

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
  await modelTrigger(page).click();
  await page.getByRole('option', { name: 'My Agents' }).click();
  await page.getByRole('option', { name: agentName }).click();
  await expect(modelTrigger(page)).toContainText(agentName);
}

async function selectEphemeralModel(page: Page) {
  await modelTrigger(page).click();
  await page.getByRole('option', { name: EPHEMERAL_ENDPOINT.label }).click();
  await page.getByRole('option', { name: EPHEMERAL_ENDPOINT.model, exact: true }).click();
  await expect(modelTrigger(page)).toContainText(EPHEMERAL_ENDPOINT.model);
}

async function sendAndAwaitReply(page: Page, text: string) {
  const response = await sendMessage(page, text);
  expect(response.ok()).toBeTruthy();
  await expect(mockReply(page)).toBeVisible({ timeout: 20000 });
  await expect(page).toHaveURL(/\/c\/(?!new)/, { timeout: 15000 });
}

async function newChat(page: Page) {
  await page.getByTestId('new-chat-button').click();
  await expect(page).toHaveURL(/\/c\/new/, { timeout: 15000 });
}

test.describe('soft default model spec', () => {
  test('applies the soft default on a fresh instance and stays applied across reloads', async ({
    page,
  }) => {
    await startFresh(page);

    await expect(modelTrigger(page)).toContainText(SOFT_DEFAULT_LABEL, { timeout: 15000 });

    // Its own auto-application must not convert it into a sticky "last" selection
    // that would behave differently on the next load.
    await page.reload({ timeout: 10000 });
    await expect(modelTrigger(page)).toContainText(SOFT_DEFAULT_LABEL, { timeout: 15000 });
  });

  test('a previously selected agent outranks the soft default', async ({ page }) => {
    test.setTimeout(120000);
    await startFresh(page);
    await expect(modelTrigger(page)).toContainText(SOFT_DEFAULT_LABEL, { timeout: 15000 });

    const agentName = uniqueName('E2E Soft Agent');
    await createAgent(page, agentName);
    await page.goto(NEW_CHAT_PATH, { timeout: 10000 });

    await selectAgent(page, agentName);

    await page.reload({ timeout: 10000 });
    await expect(modelTrigger(page)).toContainText(agentName, { timeout: 15000 });

    await page.getByTestId('new-chat-button').click();
    await expect(page).toHaveURL(/\/c\/new/, { timeout: 15000 });
    await expect(modelTrigger(page)).toContainText(agentName, { timeout: 15000 });
  });

  test('a previous ephemeral endpoint and model selection outranks the soft default', async ({
    page,
  }) => {
    test.setTimeout(120000);
    await startFresh(page);
    await expect(modelTrigger(page)).toContainText(SOFT_DEFAULT_LABEL, { timeout: 15000 });

    await selectEphemeralModel(page);

    await page.reload({ timeout: 10000 });
    await expect(modelTrigger(page)).toContainText(EPHEMERAL_ENDPOINT.model, { timeout: 15000 });
    await expect(modelTrigger(page)).not.toContainText(SOFT_DEFAULT_LABEL);

    await page.getByTestId('new-chat-button').click();
    await expect(page).toHaveURL(/\/c\/new/, { timeout: 15000 });
    await expect(modelTrigger(page)).toContainText(EPHEMERAL_ENDPOINT.model, { timeout: 15000 });
  });

  test('stays soft on New Chat after the first conversation is sent', async ({ page }) => {
    test.setTimeout(120000);
    await startFresh(page);
    await expect(modelTrigger(page)).toContainText(SOFT_DEFAULT_LABEL, { timeout: 15000 });

    await sendAndAwaitReply(page, 'first soft conversation');

    await newChat(page);
    await expect(modelTrigger(page)).toContainText(SOFT_DEFAULT_LABEL, { timeout: 15000 });
  });

  test('viewing the soft conversation re-arms it on the next New Chat', async ({ page }) => {
    test.setTimeout(120000);
    await startFresh(page);
    await expect(modelTrigger(page)).toContainText(SOFT_DEFAULT_LABEL, { timeout: 15000 });

    await sendAndAwaitReply(page, 'soft history conversation');
    const softConvoUrl = page.url();

    await newChat(page);
    await selectEphemeralModel(page);

    await page.goto(softConvoUrl, { timeout: 10000 });
    await expect(modelTrigger(page)).toContainText(SOFT_DEFAULT_LABEL, { timeout: 15000 });

    // Fresh load (not the in-memory SPA transition, which masks the regression): the
    // cold ChatRoute path resolves the New Chat purely from getDefaultModelSpec.
    await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
    await expect(modelTrigger(page)).toContainText(SOFT_DEFAULT_LABEL, { timeout: 15000 });
    await expect(modelTrigger(page)).not.toHaveText('Select a model');
  });

  // Regression: softDefault spec on an endpoint kept out of `addedEndpoints` (e.g. a
  // bedrock spec with `addedEndpoints: [agents, <custom>]`). Using the custom endpoint
  // leaves a model in history under a key the spec preset never matches, which used to
  // suppress the soft default and strand a freshly loaded New Chat on the unselectable
  // endpoint ("Select a model"). The spec must re-arm when it was the conversation used
  // last. A cold load is used because the SPA New Chat transition resolves non-
  // deterministically and can mask the dropped spec.
  test('re-arms on a fresh New Chat when the spec endpoint is outside the allow-list', async ({
    page,
  }) => {
    test.setTimeout(120000);
    await startFresh(page);
    await expect(modelTrigger(page)).toContainText(SOFT_DEFAULT_LABEL, { timeout: 15000 });

    await selectEphemeralModel(page);
    await sendAndAwaitReply(page, 'history on a different endpoint');

    await newChat(page);
    await selectModelSpec(page, SOFT_DEFAULT_LABEL);
    await sendAndAwaitReply(page, 'soft spec used last');
    const specConvoUrl = page.url();

    await page.goto(specConvoUrl, { timeout: 10000 });
    await expect(modelTrigger(page)).toContainText(SOFT_DEFAULT_LABEL, { timeout: 15000 });

    await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
    await expect(modelTrigger(page)).toContainText(SOFT_DEFAULT_LABEL, { timeout: 15000 });
    await expect(modelTrigger(page)).not.toHaveText('Select a model');
  });
});
