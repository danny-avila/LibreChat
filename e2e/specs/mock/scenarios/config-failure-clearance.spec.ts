import { randomUUID } from 'crypto';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { getE2EUser } from '../../../setup/user';
import { deleteConversations, deleteMessagesByConversation, seedConversations } from '../db';

/**
 * The composer lays out against the footer answer this deployment last gave. A
 * startup-config request that fails has given no answer, so it must not be
 * mistaken for "nothing configured": that would drop the clearance the footer
 * needs and overwrite the memory, moving the composer again on the next load
 * that succeeds.
 */

const COMPOSER = '[data-testid="composer-surface"]';
const CUSTOM_FOOTER = 'Operator policy footer';

test.use({ viewport: { width: 1280, height: 800 } });

const clearance = (page: Page) =>
  page.evaluate((selector) => {
    const form = document.querySelector(selector)?.closest('form');
    if (!form) {
      throw new Error('the composer form is not rendered');
    }
    return getComputedStyle(form).marginBottom;
  }, COMPOSER);

test.describe('config failure clearance', () => {
  test('a failed config keeps the remembered footer clearance @scenario:config-failure-keeps-the-remembered-footer', async ({
    page,
  }) => {
    test.setTimeout(60000);
    const conversationId = randomUUID();
    await seedConversations(getE2EUser().email, [
      { conversationId, title: 'Config failure', updatedAt: new Date() },
    ]);

    try {
      /** A visit that answers, so the deployment's footer is remembered. */
      await page.route('**/api/config', async (route) => {
        const response = await route.fetch();
        const config = await response.json();
        await route.fulfill({ response, json: { ...config, customFooter: CUSTOM_FOOTER } });
      });
      await page.goto(`/c/${conversationId}`, { timeout: 15000 });
      await expect(page.getByText(CUSTOM_FOOTER)).toBeVisible({ timeout: 15000 });
      const remembered = await clearance(page);

      /** Then a visit whose config request never succeeds. */
      await page.unroute('**/api/config');
      await page.route('**/api/config', (route) => route.fulfill({ status: 500, body: '{}' }));
      await page.goto(`/c/${conversationId}`, { timeout: 15000 });
      await expect(page.locator(COMPOSER)).toBeVisible();
      /** Long enough for React Query to exhaust its retries. */
      await page.waitForTimeout(4000);

      expect(await clearance(page), 'the failed config was read as a confirmed answer').toBe(
        remembered,
      );
    } finally {
      await deleteMessagesByConversation([conversationId]);
      await deleteConversations([conversationId]);
    }
  });
});
