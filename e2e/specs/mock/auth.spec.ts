import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { User } from '../../types';
import { getSecondaryE2EUser } from '../../setup/users.mock';
import cleanupUser from '../../setup/cleanupUser';
import { NEW_CHAT_PATH } from './helpers';

async function register(page: Page, user: User) {
  await page.getByRole('link', { name: 'Sign up' }).click();
  await page.getByLabel('Full name').fill(user.name);
  await page.getByLabel('Email').fill(user.email);
  await page.getByTestId('password').fill(user.password);
  await page.getByTestId('confirm_password').fill(user.password);
  await page.getByLabel('Submit registration').click();
}

async function registrationErrorIsVisible(page: Page) {
  return page
    .getByTestId('registration-error')
    .isVisible({ timeout: 500 })
    .catch(() => false);
}

async function registerIsolatedUser(page: Page, user: User) {
  await page.goto('/', { timeout: 10000 });
  await page.waitForURL(/\/login/, { timeout: 10000 });
  await register(page, user);

  try {
    await page.waitForURL(/\/c\/new/, { timeout: 10000 });
  } catch (error) {
    if (!(await registrationErrorIsVisible(page))) {
      throw error;
    }

    await cleanupUser(user);
    await page.goto('/', { timeout: 10000 });
    await page.waitForURL(/\/login/, { timeout: 10000 });
    await register(page, user);
    await page.waitForURL(/\/c\/new/, { timeout: 10000 });
  }
}

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

  test('logout ends the session and protects authenticated routes', async ({
    browser,
    baseURL,
  }) => {
    if (typeof baseURL !== 'string') {
      throw new Error('baseURL must be configured for mock auth tests');
    }

    const user = getSecondaryE2EUser();
    const context = await browser.newContext({ storageState: undefined, baseURL });
    const page = await context.newPage();

    try {
      await registerIsolatedUser(page, user);

      await page.getByTestId('nav-user').click();
      await page.getByRole('menuitem', { name: 'Log out' }).click();

      await page.waitForURL(/\/login/, { timeout: 10000 });
      await expect(page.getByLabel('Email')).toBeVisible();

      await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
      await expect(page).toHaveURL(/\/login/);
    } finally {
      await context.close();
      await cleanupUser(user);
    }
  });
});
