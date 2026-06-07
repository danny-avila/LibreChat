import { expect, test } from '@playwright/test';
import {
  isAgentsStream,
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

  test('can switch back to the previous branch after regenerating an earlier response', async ({
    page,
  }) => {
    test.setTimeout(90000);
    const firstMessage = 'branch root from e2e';
    const followUpMessage = 'follow-up on original branch from e2e';

    await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
    await selectMockEndpoint(page, MOCK_ENDPOINTS[0]);

    let response = await sendMessage(page, firstMessage);
    expect(response.ok()).toBeTruthy();
    await expect(mockReply(page)).toBeVisible();

    response = await sendMessage(page, followUpMessage);
    expect(response.ok()).toBeTruthy();
    await expect(page.getByText(followUpMessage)).toBeVisible();

    const firstAssistantMessage = page
      .getByTestId('messages-view')
      .locator('.message-render')
      .nth(1);
    await firstAssistantMessage.hover();
    const regenerateButton = firstAssistantMessage.locator('button[title="Regenerate"]').last();
    await expect(regenerateButton).toBeVisible();

    const [regenerateResponse] = await Promise.all([
      page.waitForResponse(isAgentsStream, { timeout: 30000 }),
      regenerateButton.click(),
    ]);
    expect(regenerateResponse.ok()).toBeTruthy();

    await expect(page.getByText('2 / 2')).toBeVisible();
    await page.getByRole('button', { name: 'Previous sibling message' }).click();
    await expect(page.getByText('1 / 2')).toBeVisible();
    await expect(page.getByText(followUpMessage)).toBeVisible();
  });

  test('keeps upload-to-provider CSV attached to the sent message and model input', async ({
    page,
  }) => {
    test.setTimeout(90000);

    const filename = 'provider-upload.csv';
    const assertionText = `E2E_ASSERT_PROVIDER_FILE:${filename}`;
    const fileChip = page.getByTestId('messages-view').getByRole('button', { name: filename });

    await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
    await selectMockEndpoint(page, MOCK_ENDPOINTS[0]);

    await page.getByRole('button', { name: 'Attach File Options' }).click();
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByText('Upload to Provider').click();
    const fileChooser = await fileChooserPromise;

    const uploadResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/files') &&
        response.request().method() === 'POST' &&
        response.status() === 200,
      { timeout: 30000 },
    );
    await fileChooser.setFiles({
      name: filename,
      mimeType: 'text/csv',
      buffer: Buffer.from('name,value\nalpha,1\n'),
    });
    await uploadResponsePromise;

    await expect(page.getByRole('button', { name: filename })).toBeVisible();

    const input = page.getByRole('textbox', { name: 'Message input' });
    await input.click();
    await input.fill(assertionText);
    await expect(page.getByTestId('send-button')).toBeEnabled();

    const [response] = await Promise.all([
      page.waitForResponse(isAgentsStream, { timeout: 30000 }),
      page.getByTestId('send-button').click(),
    ]);
    expect(response.ok()).toBeTruthy();

    await expect(
      page
        .getByTestId('messages-view')
        .getByText(`E2E provider file assertion passed: ${filename}`),
    ).toBeVisible();
    await expect(fileChip).toBeVisible();

    await expect(page).toHaveURL(/\/c\/[0-9a-fA-F-]{36}$/);
    const conversationUrl = page.url();
    await page.reload({ timeout: 10000 });
    await expect(page).toHaveURL(conversationUrl);
    await expect(fileChip).toBeVisible();
  });
});
