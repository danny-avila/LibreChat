import { expect, test } from '@playwright/test';
import type { TStartupConfig } from 'librechat-data-provider';
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

  test('explains why an administrator-required 2FA control cannot be disabled', async ({
    page,
  }) => {
    await page.route('**/api/config', async (route) => {
      const response = await route.fetch();
      const config = (await response.json()) as TStartupConfig;
      config.twoFactorAuthenticationRequired = true;
      await route.fulfill({ response, json: config });
    });
    await page.route('**/api/user', async (route) => {
      const response = await route.fetch();
      const user = (await response.json()) as { twoFactorEnabled?: boolean };
      user.twoFactorEnabled = true;
      await route.fulfill({ response, json: user });
    });

    await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
    await page.getByTestId('nav-user').click();
    await page.getByRole('menuitem', { name: 'Settings' }).click();
    await page.getByRole('tab', { name: 'Account' }).click();

    const disableButton = page.getByRole('button', { name: 'Disable 2FA' });
    const tooltipTrigger = page.getByTestId('required-2fa-disable-control');

    await expect(disableButton).toBeDisabled();
    await expect(tooltipTrigger).toHaveCSS('cursor', 'not-allowed');

    for (let tabCount = 0; tabCount < 20; tabCount++) {
      await page.keyboard.press('Tab');
      if (await tooltipTrigger.evaluate((element) => document.activeElement === element)) {
        break;
      }
    }
    await expect(tooltipTrigger).toBeFocused();
    await expect(page.getByRole('tooltip')).toHaveText('Required by administrator');

    await page.keyboard.press('Tab');
    await expect(page.getByRole('tooltip')).toBeHidden();
    await page.mouse.move(0, 0);
    await tooltipTrigger.hover();
    await expect(page.getByRole('tooltip')).toHaveText('Required by administrator');
  });
});
