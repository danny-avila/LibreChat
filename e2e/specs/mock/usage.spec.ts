import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  MOCK_ENDPOINTS,
  NEW_CHAT_PATH,
  mockReply,
  sendMessage,
  selectMockEndpoint,
} from './helpers';

const gauge = (page: Page) => page.getByTestId('token-usage');
const gaugeMeter = (page: Page) => gauge(page).getByRole('meter');

async function expectGaugeAboveZero(page: Page) {
  await expect(gauge(page)).toBeVisible({ timeout: 20000 });
  await expect(gaugeMeter(page)).toHaveAttribute('aria-valuenow', /[1-9]/, { timeout: 20000 });
}

test.describe('context usage gauge', () => {
  test('tracks usage from live SSE events and survives reload', async ({ page }) => {
    test.setTimeout(120000);
    await page.goto(NEW_CHAT_PATH, { timeout: 10000 });

    // REQUIRED so the message streams without a real key.
    await selectMockEndpoint(page, MOCK_ENDPOINTS[0]);

    const response = await sendMessage(page, 'hello');
    expect(response.ok()).toBeTruthy();
    await expect(mockReply(page)).toBeVisible({ timeout: 20000 });
    await expect(page).toHaveURL(/\/c\/(?!new)/, { timeout: 15000 });

    /** Live path: the agents pipeline's context snapshot + usage events fill the gauge */
    await expectGaugeAboveZero(page);

    /** Breakdown popover: context section always, usage section from on_token_usage events */
    await gauge(page).hover();
    const popover = page.getByRole('region', { name: 'Context usage' });
    await expect(popover).toBeVisible({ timeout: 10000 });
    await expect(popover.getByText('Context window')).toBeVisible();
    await expect(popover.getByText('Input', { exact: true })).toBeVisible();
    await expect(popover.getByText('Output', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');

    /** Fallback path: after reload there is no snapshot — the gauge rebuilds
     *  from per-message tokenCount history returned by the messages query */
    await page.reload({ timeout: 15000 });
    await expect(mockReply(page)).toBeVisible({ timeout: 20000 });
    await expectGaugeAboveZero(page);
  });
});
