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

    /** Breakdown popover: context section always; the usage section is
     *  scoped by testid since the pre-snapshot fallback renders its own
     *  Input/Output rows when the lib predates on_context_usage */
    await gauge(page).hover();
    const popover = page.getByRole('region', { name: 'Context usage' });
    await expect(popover).toBeVisible({ timeout: 10000 });
    await expect(popover.getByText('Context window')).toBeVisible();
    const usageSection = popover.getByTestId('token-usage-totals');
    await expect(usageSection).toBeVisible({ timeout: 10000 });
    await expect(usageSection.getByText('Input', { exact: true })).toBeVisible();
    await expect(usageSection.getByText('Output', { exact: true })).toBeVisible();

    /** Cost row: interface.contextCost is enabled in the harness yaml, the
     *  token-config endpoint prices mock models at the default rate, and
     *  the fake model emits usage — so a $ value must render */
    await expect(popover.getByText('Session cost')).toBeVisible();
    await expect(popover.getByText(/\$\d|<\$0\.01/)).toBeVisible();
    await page.keyboard.press('Escape');

    /** Fallback path: after reload there is no snapshot — the gauge rebuilds
     *  from per-message tokenCount history returned by the messages query */
    await page.reload({ timeout: 15000 });
    await expect(mockReply(page)).toBeVisible({ timeout: 20000 });
    await expectGaugeAboveZero(page);
  });
});
