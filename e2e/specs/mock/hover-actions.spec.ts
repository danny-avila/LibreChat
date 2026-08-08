import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  MOCK_ENDPOINTS,
  NEW_CHAT_PATH,
  messagesView,
  selectMockEndpoint,
  sendMessage,
} from './helpers';

/**
 * Regression guard for the edit action leaking through mid-stream.
 *
 * The unit spec can only assert class names: jsdom applies no stylesheet, so it
 * cannot see that the shared Button's `disabled:opacity-50` (specificity 0,2,0)
 * outranks a plain `opacity-0` (0,1,0) and repaints the hidden pencil at half
 * opacity. Only a real browser resolves that cascade, which is why this lives
 * here rather than in Jest.
 */

const uniqueLabel = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;

const userTurn = (page: Page) =>
  messagesView(page)
    .locator('.message-render')
    .filter({ has: page.locator('.user-turn') })
    .last();

const stopButton = (page: Page) => page.getByRole('button', { name: 'Stop generating' });

test.describe('message hover actions', () => {
  test('keeps the edit action fully hidden while a generation streams', async ({ page }) => {
    test.setTimeout(120000);
    const label = uniqueLabel('hover-edit');

    await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
    await selectMockEndpoint(page, MOCK_ENDPOINTS[0]);

    const run = await sendMessage(page, `E2E_SLOW_REPLY:${label}`);
    expect(run.ok()).toBeTruthy();
    await expect(messagesView(page).getByText('chunk-010')).toBeVisible({ timeout: 15000 });

    const row = userTurn(page);
    const editButton = row.locator('button[id^="edit-"]');
    const copyButton = row.getByRole('button', { name: 'Copy to clipboard' });

    await row.hover();

    /** Pin the window: if the stream already settled, the edit assertion below
     *  would be checking the wrong state and pass for the wrong reason. */
    await expect(stopButton(page)).toBeVisible();

    /** The sibling action proves the row is genuinely hovered — without it a
     *  broken hover would make the edit assertion pass for the wrong reason. */
    await expect(copyButton).toHaveCSS('opacity', '1');
    await expect(editButton).toHaveCSS('opacity', '0');
    await expect(editButton).toBeDisabled();

    /** ...and the affordance must come back, or "hidden" would just be "gone". */
    await expect(stopButton(page)).toBeHidden({ timeout: 60000 });
    await row.hover();
    await expect(editButton).toBeEnabled();
    await expect(editButton).toHaveCSS('opacity', '1');
  });
});
