import { expect, test } from '@playwright/test';
import { NEW_CHAT_PATH } from './helpers';

test.describe('auth session', () => {
  test('session persists across a full page reload', async ({ page }) => {
    await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByTestId('nav-user')).toBeVisible();

    await page.reload({ timeout: 10000 });

    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByTestId('nav-user')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Message input' })).toBeVisible();
  });

  test('logout ends the session and protects authenticated routes', async ({ page }) => {
    await page.goto(NEW_CHAT_PATH, { timeout: 10000 });

    await page.getByTestId('nav-user').click();
    await page.getByRole('menuitem', { name: 'Log out' }).click();

    await page.waitForURL(/\/login/, { timeout: 10000 });
    await expect(page.getByLabel('Email')).toBeVisible();

    await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
    await expect(page).toHaveURL(/\/login/);
  });
});
