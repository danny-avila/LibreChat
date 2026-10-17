import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { NEW_CHAT_PATH, selectMockEndpoint } from '../helpers';
import { openPanel } from './panels';

const PROVIDER = 'Mock Provider A';
const HAIKU_55 = 'claude-haiku-5-5';
const HAIKU_45 = 'claude-haiku-4-5';

/** Mock Provider A takes Anthropic's parameter set; the model name alone decides which
 *  of those settings the panel keeps, so the two Claude names are listed on that endpoint. */
async function openParametersFor(page: Page, model: string): Promise<void> {
  await page.route(
    (url) => url.pathname === '/api/models',
    async (route) => {
      const response = await route.fetch();
      const models = await response.json();
      models[PROVIDER] = [...(models[PROVIDER] ?? []), HAIKU_55, HAIKU_45];
      await route.fulfill({ response, json: models });
    },
  );
  await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
  await selectMockEndpoint(page, { label: PROVIDER, model });
  await openPanel(page, 'parameters', 'Parameters');
  await expect(page.getByRole('region', { name: 'Reasoning' })).toBeVisible();
}

test.describe('Claude Haiku model parameters', () => {
  test('Haiku 5.5 offers thinking and effort without a budget or sampling controls @scenario:haiku-55-hides-budget-and-sampling', async ({
    page,
  }) => {
    await openParametersFor(page, HAIKU_55);

    const reasoning = page.getByRole('region', { name: 'Reasoning' });
    await expect(reasoning.getByRole('switch', { name: /^Thinking/ }).first()).toBeVisible();
    await expect(reasoning.getByText('Effort', { exact: true }).first()).toBeVisible();

    await expect(page.getByText('Thinking Budget')).toHaveCount(0);
    await expect(page.getByText('Temperature', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Top P', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Top K', { exact: true })).toHaveCount(0);
  });

  test('Haiku 4.5 keeps the thinking budget and sampling controls @scenario:haiku-45-keeps-budget-and-sampling', async ({
    page,
  }) => {
    await openParametersFor(page, HAIKU_45);

    const reasoning = page.getByRole('region', { name: 'Reasoning' });
    await expect(reasoning.getByRole('switch', { name: /^Thinking/ }).first()).toBeVisible();
    await expect(reasoning.getByText('Thinking Budget')).toBeVisible();
    await expect(page.getByText('Temperature', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Top P', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Top K', { exact: true }).first()).toBeVisible();
  });
});
