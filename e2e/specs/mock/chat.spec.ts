import { expect, test } from '@playwright/test';
import {
  MOCK_ENDPOINTS,
  NEW_CHAT_PATH,
  mockReply,
  selectMockEndpoint,
  sendMessage,
} from './helpers';

test.describe('core chat loop', () => {
  test('streams a response, saves the conversation, and persists across reload', async ({
    page,
  }) => {
    test.setTimeout(60000);
    const userMessage = 'ping from e2e';

    await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
    await selectMockEndpoint(page, MOCK_ENDPOINTS[0]);

    const response = await sendMessage(page, userMessage);
    expect(response.ok()).toBeTruthy();

    await expect(page.getByText(userMessage)).toBeVisible();
    await expect(mockReply(page)).toBeVisible();

    await expect(page).toHaveURL(/\/c\/[0-9a-fA-F-]{36}$/);
    const conversationUrl = page.url();

    await expect(page.getByTestId('convo-item').first()).toBeVisible();

    await page.reload({ timeout: 10000 });
    await expect(page).toHaveURL(conversationUrl);
    await expect(page.getByText(userMessage)).toBeVisible();
    await expect(mockReply(page)).toBeVisible();
    await expect(page.getByTestId('convo-item').first()).toBeVisible();
  });
});
