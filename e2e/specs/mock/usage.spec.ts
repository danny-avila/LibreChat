import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  mockReply,
  sendMessage,
  messagesView,
  MOCK_ENDPOINTS,
  NEW_CHAT_PATH,
  isAgentsStream,
  selectMockEndpoint,
} from './helpers';

const gauge = (page: Page) => page.getByTestId('token-usage');
const gaugeMeter = (page: Page) => gauge(page).getByRole('meter');

async function expectGaugeAboveZero(page: Page) {
  await expect(gauge(page)).toBeVisible({ timeout: 20000 });
  await expect(gaugeMeter(page)).toHaveAttribute('aria-valuenow', /[1-9]/, { timeout: 20000 });
}

/** Opens the gauge hover popover and returns its region locator. */
async function openBreakdown(page: Page) {
  await expectGaugeAboveZero(page);
  await gauge(page).hover();
  const popover = page.getByRole('region', { name: 'Context usage' });
  await expect(popover).toBeVisible({ timeout: 10000 });
  return popover;
}

/** Granularity lives only in the live `on_context_usage` snapshot; its rows
 *  render under the `context-breakdown` testid, the coarse message-history
 *  fallback under `context-estimate`. They are mutually exclusive. */
async function expectGranular(page: Page) {
  const popover = await openBreakdown(page);
  await expect(popover.getByTestId('context-breakdown')).toBeVisible({ timeout: 10000 });
  await expect(popover.getByTestId('context-estimate')).toHaveCount(0);
  await expect(popover.getByText('Messages', { exact: true })).toBeVisible();
  await expect(popover.getByText('Free space', { exact: true })).toBeVisible();
}

async function sendAndAwaitReply(page: Page, text: string) {
  const response = await sendMessage(page, text);
  expect(response.ok()).toBeTruthy();
  await expect(mockReply(page)).toBeVisible({ timeout: 20000 });
  await expect(page).toHaveURL(/\/c\/(?!new)/, { timeout: 15000 });
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
     *  token-config endpoint prices mock models at the default rate, and the
     *  fake model emits usage — so a $ value must render. A single (unbranched)
     *  conversation shows only the branch cost, no all-branches total line. */
    const costSection = popover.getByTestId('token-usage-cost');
    await expect(costSection).toBeVisible();
    await expect(costSection.getByText(/\$\d|<\$0\.01/)).toBeVisible();
    await expect(costSection.getByText('All branches')).toHaveCount(0);
    await page.keyboard.press('Escape');

    /** Persistence (Parts A + B): after reload the breakdown rehydrates from
     *  the response message's metadata.contextUsage + metadata.usage — the
     *  granular rows AND the branch cost survive without generating a turn. */
    await page.reload({ timeout: 15000 });
    await expect(mockReply(page)).toBeVisible({ timeout: 20000 });
    await expectGaugeAboveZero(page);
    const reloaded = await openBreakdown(page);
    await expect(reloaded.getByTestId('context-breakdown')).toBeVisible({ timeout: 10000 });
    const reloadedCost = reloaded.getByTestId('token-usage-cost');
    await expect(reloadedCost).toBeVisible();
    await expect(reloadedCost.getByText(/\$\d|<\$0\.01/)).toBeVisible();
  });

  test('renders the granular breakdown from the live context snapshot', async ({ page }) => {
    test.setTimeout(120000);
    await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
    await selectMockEndpoint(page, MOCK_ENDPOINTS[0]);

    await sendAndAwaitReply(page, 'hello');

    /** The agents pipeline emits on_context_usage on each model call, so the
     *  breakdown — not the estimate fallback — drives the popover. */
    await expectGranular(page);
  });

  test('shows branch cost with an all-branches total after regenerating', async ({ page }) => {
    test.setTimeout(150000);
    await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
    await selectMockEndpoint(page, MOCK_ENDPOINTS[0]);

    await sendAndAwaitReply(page, 'hello');

    /** Single branch: branch cost == total, so no all-branches line renders. */
    let popover = await openBreakdown(page);
    await expect(popover.getByTestId('token-usage-cost')).toBeVisible();
    await expect(popover.getByText('All branches')).toHaveCount(0);
    await page.keyboard.press('Escape');

    /** Regenerate to create a sibling branch (B). */
    const assistantMessage = messagesView(page).locator('.message-render').nth(1);
    await assistantMessage.hover();
    const regenerateButton = assistantMessage.locator('button[title="Regenerate"]').last();
    await expect(regenerateButton).toBeVisible();
    const [regen] = await Promise.all([
      page.waitForResponse(isAgentsStream, { timeout: 30000 }),
      regenerateButton.click(),
    ]);
    expect(regen.ok()).toBeTruthy();
    await expect(page.getByText('2 / 2')).toBeVisible({ timeout: 20000 });

    /** Branch cost is shown live for the regenerated branch. */
    popover = await openBreakdown(page);
    await expect(popover.getByTestId('token-usage-cost')).toBeVisible();
    await page.keyboard.press('Escape');

    /** After reload both branches rehydrate from persisted metadata.usage, so
     *  the cost is branch-scoped and a muted all-branches total appears (it
     *  exceeds the single viewed branch). */
    await page.reload({ timeout: 15000 });
    await expect(mockReply(page)).toBeVisible({ timeout: 20000 });
    const reloaded = await openBreakdown(page);
    const costSection = reloaded.getByTestId('token-usage-cost');
    await expect(costSection).toBeVisible();
    await expect(costSection.getByText('Cost (this branch)')).toBeVisible();
    await expect(costSection.getByText('All branches')).toBeVisible();
  });

  test('preserves the granular breakdown after switching branches', async ({ page }) => {
    test.setTimeout(150000);
    await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
    await selectMockEndpoint(page, MOCK_ENDPOINTS[0]);

    await sendAndAwaitReply(page, 'hello');

    /** Branch A: the just-generated branch shows its live snapshot. */
    await expectGranular(page);
    await page.keyboard.press('Escape');

    /** Regenerate to create a sibling branch (B), which overwrites the single
     *  live snapshot and anchors it to B's response (proven selectors mirror
     *  chat.spec.ts's branch test). */
    const assistantMessage = messagesView(page).locator('.message-render').nth(1);
    await assistantMessage.hover();
    const regenerateButton = assistantMessage.locator('button[title="Regenerate"]').last();
    await expect(regenerateButton).toBeVisible();
    const [regen] = await Promise.all([
      page.waitForResponse(isAgentsStream, { timeout: 30000 }),
      regenerateButton.click(),
    ]);
    expect(regen.ok()).toBeTruthy();
    await expect(page.getByText('2 / 2')).toBeVisible({ timeout: 20000 });

    /** Switch back to branch A. Its live snapshot was overwritten by B, so the
     *  rows can only survive via the per-anchor snapshot history map. */
    await page.getByRole('button', { name: 'Previous sibling message' }).click();
    await expect(page.getByText('1 / 2')).toBeVisible({ timeout: 10000 });

    await expectGranular(page);

    /** Branch cost must also survive the switch (live, no reload): branch A's
     *  flushed usage is restored from the sticky usage history even though its
     *  cache message lacks metadata.usage and B's regenerate dropped it. */
    const popover = page.getByRole('region', { name: 'Context usage' });
    const costSection = popover.getByTestId('token-usage-cost');
    await expect(costSection).toBeVisible();
    await expect(costSection.getByText(/\$\d|<\$0\.01/)).toBeVisible();
  });
});
