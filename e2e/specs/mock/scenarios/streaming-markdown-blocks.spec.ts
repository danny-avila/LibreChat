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
    const completedHeading = await assistantMessage
      .getByRole('heading', { name: 'E2E streaming markdown heading' })
      .elementHandle();
    const tail = assistantMessage.locator('div.whitespace-pre-wrap');
    await expect(tail).toBeVisible();
    await expect(tail).toHaveJSProperty('childElementCount', 0);

    await expect(assistantMessage.getByText('E2E streaming markdown final paragraph.')).toBeVisible(
      { timeout: 60_000 },
    );
    await expect(
      assistantMessage.locator('code').filter({ hasText: 'e2eIncrementalMarkdown' }),
    ).toBeVisible();
    await expect(assistantMessage.getByRole('table')).toBeVisible();
    await expect(assistantMessage).toContainText('日本語');
    await expect(page.getByRole('button', { name: 'Stop generating' })).toBeHidden();
    await expect(tail).toHaveCount(0);
    expect(await completedHeading?.evaluate((node) => node.isConnected)).toBe(true);

    await page.reload();
    const restoredMessage = messagesView(page).locator('.message-render').last();
    await expect(
      restoredMessage.getByRole('heading', { name: 'E2E streaming markdown heading' }),
    ).toBeVisible();
    await expect(restoredMessage.getByRole('table')).toBeVisible();
    await expect(restoredMessage).toContainText('日本語');
    await expect(restoredMessage.locator('div.whitespace-pre-wrap')).toHaveCount(0);
  });

  test('formats the growing tail when generation is stopped @scenario:stopped-markdown-promotes-growing-tail', async ({
    page,
  }) => {
    await page.goto(NEW_CHAT_PATH);
    await selectMockEndpoint(page, MOCK_ENDPOINTS[0]);
    const response = await sendMessage(page, 'E2E_STREAMING_MARKDOWN_REPLY');
    expect(response.ok()).toBeTruthy();

    const assistantMessage = messagesView(page).locator('.message-render').last();
    const heading = assistantMessage.getByRole('heading', {
      name: 'E2E streaming markdown heading',
    });
    await expect(heading).toBeVisible();
    await expect(assistantMessage.locator('div.whitespace-pre-wrap')).toBeVisible();
    await page.getByRole('button', { name: 'Stop generating' }).click();

    await expect(page.getByRole('button', { name: 'Stop generating' })).toBeHidden();
    await expect(assistantMessage.locator('div.whitespace-pre-wrap')).toHaveCount(0);
    await expect(heading).toBeVisible();
  });

  test('isolates markdown blocks across concurrent conversations @scenario:concurrent-streams-keep-message-blocks-isolated', async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    const secondPage = await context.newPage();
    try {
      await Promise.all([
        page.goto(NEW_CHAT_PATH, { timeout: 10_000 }),
        secondPage.goto(NEW_CHAT_PATH, { timeout: 10_000 }),
      ]);
      await Promise.all([
        selectMockEndpoint(page, MOCK_ENDPOINTS[0]),
        selectMockEndpoint(secondPage, MOCK_ENDPOINTS[1]),
      ]);

      await Promise.all([
        sendMessage(page, 'E2E_STREAMING_MARKDOWN_REPLY'),
        sendMessage(secondPage, 'E2E_STREAMING_MARKDOWN_REPLY'),
      ]);

      const firstAssistantMessage = messagesView(page).locator('.message-render').last();
      const secondAssistantMessage = messagesView(secondPage).locator('.message-render').last();
      await Promise.all([
        expect(
          firstAssistantMessage.getByText('E2E streaming markdown final paragraph.'),
        ).toBeVisible({ timeout: 90_000 }),
        expect(
          secondAssistantMessage.getByText('E2E streaming markdown final paragraph.'),
        ).toBeVisible({ timeout: 90_000 }),
      ]);
      await expect(firstAssistantMessage).toContainText('日本語');
      await expect(secondAssistantMessage).toContainText('日本語');
    } finally {
      await secondPage.close();
    }
  });
});
