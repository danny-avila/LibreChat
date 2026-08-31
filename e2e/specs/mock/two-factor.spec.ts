import { expect, test } from '@playwright/test';
import { NEW_CHAT_PATH } from './helpers';

/**
 * Regression test for the framer-motion / Vite incompatibility that crashed the
 * client with "e is not a function" when opening the Enable 2FA dialog
 * (issue #13511). The dialog body is a framer-motion `<motion.div>`; on the
 * broken build it throws while rendering, so the dialog never appears.
 *
 * This only reproduces in a production build (the mock harness builds the client
 * via `e2e:prepare`), matching the original report.
 */
test.describe('account settings · two-factor dialog', () => {
  test('opening the Enable 2FA dialog renders without a framer-motion crash', async ({ page }) => {
    test.setTimeout(60000);

    const framerErrors: string[] = [];
    page.on('pageerror', (error) => {
      if (/is not a function/i.test(error.message)) {
        framerErrors.push(error.message);
      }
    });

    await page.goto(NEW_CHAT_PATH, { timeout: 10000 });

    await page.getByTestId('nav-user').click();
    await page.getByRole('menuitem', { name: 'Settings' }).click();
    await page.getByRole('tab', { name: 'Account' }).click();

    // Opening the dialog mounts the framer-motion-animated body — the crash site.
    await page.getByRole('button', { name: 'Enable 2FA' }).click();

    // With the broken framer-motion build this content never renders.
    await expect(page.locator('#two-factor-authentication-dialog')).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: 'Generate QR Code' })).toBeVisible();

    expect(
      framerErrors,
      `framer-motion threw while rendering the 2FA dialog: ${framerErrors.join(' | ')}`,
    ).toEqual([]);
  });
});
