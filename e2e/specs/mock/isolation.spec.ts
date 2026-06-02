import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import type { User } from '../../types';
import { getSecondaryE2EUser } from '../../setup/users.mock';
import { MOCK_ENDPOINTS, NEW_CHAT_PATH, selectMockEndpoint, sendMessage } from './helpers';

const A_PRIVATE_MARKER = 'A-private-conversation-marker';

async function register(page: Page, user: User) {
  await page.getByRole('link', { name: 'Sign up' }).click();
  await page.getByLabel('Full name').fill(user.name);
  await page.getByLabel('Email').fill(user.email);
  await page.getByTestId('password').fill(user.password);
  await page.getByTestId('confirm_password').fill(user.password);
  await page.getByLabel('Submit registration').click();
}

/** Register the secondary user in a throwaway context, then log in within `page`. */
async function ensureSecondaryUser(browser: Browser, page: Page, user: User) {
  const setupContext = await browser.newContext({ storageState: undefined });
  const setupPage = await setupContext.newPage();
  try {
    await setupPage.goto('/', { timeout: 10000 });
    await setupPage.waitForURL(/\/login/, { timeout: 10000 });
    await register(setupPage, user);
    await Promise.race([
      setupPage.waitForURL(/\/c\/new/, { timeout: 10000 }).catch(() => undefined),
      setupPage
        .getByTestId('registration-error')
        .waitFor({ timeout: 10000 })
        .catch(() => undefined),
    ]);
  } finally {
    await setupContext.close();
  }

  await page.goto('/login', { timeout: 10000 });
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByTestId('login-button').click();
  await page.waitForURL(/\/c\/new/, { timeout: 10000 });
}

test.describe('user isolation', () => {
  test('user B cannot see user A conversations', async ({ page, browser }) => {
    test.setTimeout(90000);

    // User A (authenticated via storageState) creates a private conversation.
    await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
    await selectMockEndpoint(page, MOCK_ENDPOINTS[0]);
    await sendMessage(page, A_PRIVATE_MARKER);
    await expect(page.getByText(A_PRIVATE_MARKER)).toBeVisible();
    await expect(page).toHaveURL(/\/c\/[0-9a-fA-F-]{36}$/);
    const conversationAUrl = page.url();

    // User B in a fresh, unauthenticated context.
    const contextB = await browser.newContext({ storageState: undefined });
    const pageB = await contextB.newPage();
    try {
      await ensureSecondaryUser(browser, pageB, getSecondaryE2EUser());

      // (a) Sidebar list does not expose A's conversation.
      await pageB.goto(NEW_CHAT_PATH, { timeout: 10000 });
      await expect(pageB.getByRole('textbox', { name: 'Message input' })).toBeVisible();
      await expect(pageB.getByText(A_PRIVATE_MARKER)).toHaveCount(0);

      // (b) Direct navigation to A's conversation does not reveal its content.
      await pageB.goto(conversationAUrl, { timeout: 10000 });
      await expect(pageB.getByRole('textbox', { name: 'Message input' })).toBeVisible();
      await expect(pageB.getByText(A_PRIVATE_MARKER)).toHaveCount(0);
    } finally {
      await contextB.close();
    }
  });
});
