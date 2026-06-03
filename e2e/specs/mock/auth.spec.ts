import { expect, test } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import type { User } from '../../types';
import { getSecondaryE2EUser } from '../../setup/users.mock';
import cleanupUser from '../../setup/cleanupUser';
import { NEW_CHAT_PATH } from './helpers';

async function getIsolatedStorageState(request: APIRequestContext, user: User) {
  await cleanupUser(user);

  const registerResponse = await request.post('/api/auth/register', {
    data: {
      email: user.email,
      name: user.name,
      password: user.password,
      confirm_password: user.password,
    },
  });
  expect(registerResponse.ok()).toBeTruthy();

  const loginResponse = await request.post('/api/auth/login', {
    data: {
      email: user.email,
      password: user.password,
    },
  });
  expect(loginResponse.ok()).toBeTruthy();

  return request.storageState();
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
    request,
    browser,
    baseURL,
  }) => {
    test.setTimeout(90000);
    if (typeof baseURL !== 'string') {
      throw new Error('baseURL must be configured for mock auth tests');
    }

    const user = getSecondaryE2EUser();
    const context = await browser.newContext({
      storageState: await getIsolatedStorageState(request, user),
      baseURL,
    });
    await context.addInitScript(() => {
      localStorage.setItem('navVisible', 'true');
    });
    const page = await context.newPage();

    try {
      await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
      await expect(page).not.toHaveURL(/\/login/);

      await page.getByTestId('nav-user').click();
      await page.getByRole('menuitem', { name: 'Log out' }).click();

      await page.waitForURL(/\/login/, { timeout: 10000 });
      await expect(page.getByLabel('Email')).toBeVisible();

      await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
      await expect(page).toHaveURL(/\/login/);
    } finally {
      await context.close().catch(() => undefined);
      await cleanupUser(user);
    }
  });
});
