import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { TMessage } from 'librechat-data-provider';
import {
  NEW_CHAT_PATH,
  fetchJson,
  getAccessToken,
  selectModelSpec,
  sendMessageAndWaitForCompletion,
} from '../helpers';

const PROVIDER = 'Mock Provider A';
const MODEL = 'claude-sonnet-5-5';
const SPEC_LABEL = 'E2E Claude Sonnet 5.5';
/** Published Claude Sonnet 5.5 rates per million tokens: 5-minute writes 2.50, 1-hour writes 4 */
const WRITE_5M = 2.5;
const WRITE_1H = 4;
/** The fake model reports 2000 of its cache writes as 1-hour for `E2E_CACHE_USAGE: 1h` */
const ONE_HOUR_WRITES = 2000;

/** Pins Mock Provider A to a Claude model through a model spec so the usage is
 *  priced with that model's tables, as a real Anthropic call would be. */
async function openClaudeChat(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === '/api/models',
    async (route) => {
      const response = await route.fetch();
      const models = await response.json();
      models[PROVIDER] = [...(models[PROVIDER] ?? []), MODEL];
      await route.fulfill({ response, json: models });
    },
  );
  await page.route(
    (url) => url.pathname === '/api/config',
    async (route) => {
      const response = await route.fetch();
      const config = await response.json();
      const list = Array.isArray(config.modelSpecs?.list) ? config.modelSpecs.list : [];
      const spec = {
        name: 'e2e-claude-sonnet-5-5',
        label: SPEC_LABEL,
        preset: { endpoint: PROVIDER, model: MODEL },
      };
      await route.fulfill({
        response,
        json: { ...config, modelSpecs: { ...(config.modelSpecs ?? {}), list: [...list, spec] } },
      });
    },
  );
  await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
  await selectModelSpec(page, SPEC_LABEL);
}

/** The persisted cost of the reply to `text`, sent in a new chat */
async function replyCost(page: Page, text: string): Promise<number> {
  await openClaudeChat(page);
  const response = await sendMessageAndWaitForCompletion(page, text);
  const { conversationId } = (await response.json()) as { conversationId: string };
  const token = await getAccessToken(page);
  const messages = await fetchJson<TMessage[]>(
    page,
    `/api/messages/${encodeURIComponent(conversationId)}`,
    token,
  );
  const reply = messages.find((message) => !message.isCreatedByUser);
  const usage = (reply?.metadata as { usage?: { cost?: number; cacheWrite?: number } } | undefined)
    ?.usage;
  expect(usage?.cacheWrite).toBe(3000);
  expect(typeof usage?.cost).toBe('number');
  return usage?.cost as number;
}

test.describe('Prompt cache write pricing', () => {
  test('1-hour cache writes cost the 1-hour rate, the rest of the call unchanged @scenario:cache-1h-writes-priced-at-1h-rate', async ({
    page,
  }) => {
    const fiveMinute = await replyCost(page, 'E2E_CACHE_USAGE: 5m price check');
    const oneHour = await replyCost(page, 'E2E_CACHE_USAGE: 1h price check');

    expect(oneHour - fiveMinute).toBeCloseTo((ONE_HOUR_WRITES * (WRITE_1H - WRITE_5M)) / 1e6, 9);
  });
});
