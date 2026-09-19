import { expect, test } from '@playwright/test';
import {
  MOCK_ENDPOINTS,
  NEW_CHAT_PATH,
  messagesView,
  selectMockEndpoint,
  sendMessage,
} from '../helpers';

test.describe('streaming markdown blocks', () => {
  test('preserves completed blocks while streaming and renders the final markdown @scenario:streamed-markdown-keeps-completed-blocks-and-final-content', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto(NEW_CHAT_PATH, { timeout: 10_000 });
    await selectMockEndpoint(page, MOCK_ENDPOINTS[0]);

    const response = await sendMessage(page, 'E2E_STREAMING_MARKDOWN_REPLY');
    expect(response.ok()).toBeTruthy();

    const assistantMessage = messagesView(page).locator('.message-render').last();
    await expect(page.getByRole('button', { name: 'Stop generating' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      assistantMessage.getByRole('heading', { name: 'E2E streaming markdown heading' }),
    ).toBeVisible({ timeout: 30_000 });

    await expect(
      assistantMessage.getByText('E2E streaming markdown final paragraph.'),
    ).toBeVisible({ timeout: 60_000 });
    await expect(
      assistantMessage.locator('code').filter({ hasText: 'e2eIncrementalMarkdown' }),
    ).toBeVisible();
    await expect(assistantMessage.getByRole('table')).toBeVisible();
    await expect(assistantMessage).toContainText('日本語');
  });
});
