import { expect, test } from '@playwright/test';

import {
  enableCodeInterpreter,
  isAgentsStream,
  messagesView,
  MOCK_ENDPOINTS,
  NEW_CHAT_PATH,
  selectMockEndpoint,
  sendMessage,
} from '../helpers';

const stopButton = (page: Parameters<typeof sendMessage>[0]) =>
  page.getByRole('button', { name: 'Stop generating' });

const highlightedCode = (page: Parameters<typeof sendMessage>[0]) =>
  messagesView(page).locator('code.hljs.language-bash').last();

async function openHighlightChat(page: Parameters<typeof sendMessage>[0]) {
  await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
  await selectMockEndpoint(page, MOCK_ENDPOINTS[1]);
  await enableCodeInterpreter(page);
}

async function expectHighlightedCode(page: Parameters<typeof sendMessage>[0]) {
  const code = highlightedCode(page);
  await expect(code).toBeVisible({ timeout: 30000 });
  await expect.poll(() => code.locator('span').count(), { timeout: 30000 }).toBeGreaterThan(0);
  return code;
}

test.describe('streamed code highlighting', () => {
  test('streamed-code-highlights-after-settle @scenario:streamed-code-highlights-after-settle', async ({
    page,
  }) => {
    test.setTimeout(120000);
    await openHighlightChat(page);
    await sendMessage(page, 'E2E_HIGHLIGHT_CODE:stream');

    await expect(stopButton(page)).toBeVisible({ timeout: 30000 });
    const code = await expectHighlightedCode(page);
    await expect(stopButton(page)).toBeHidden({ timeout: 120000 });
    await expect(code).toContainText('line-119-☃');
    await expect.poll(() => code.locator('span').count()).toBeGreaterThan(0);
  });

  test('interrupted-code-highlights-after-cancel @scenario:interrupted-code-highlights-after-cancel', async ({
    page,
  }) => {
    test.setTimeout(120000);
    await openHighlightChat(page);
    await sendMessage(page, 'E2E_HIGHLIGHT_CODE:cancel');

    await expect(stopButton(page)).toBeVisible({ timeout: 30000 });
    const code = await expectHighlightedCode(page);
    await stopButton(page).click();
    await expect(stopButton(page)).toBeHidden({ timeout: 30000 });
    await expect(code).toContainText(/line-\d+-☃/);
    await expect.poll(() => code.locator('span').count()).toBeGreaterThan(0);
  });

  test('regenerated-code-highlights-latest-branch @scenario:regenerated-code-highlights-latest-branch', async ({
    page,
  }) => {
    test.setTimeout(180000);
    await openHighlightChat(page);
    await sendMessage(page, 'E2E_HIGHLIGHT_CODE:regenerate');
    await expect(stopButton(page)).toBeHidden({ timeout: 120000 });
    await expectHighlightedCode(page);

    const assistant = messagesView(page).locator('.message-render').last();
    await assistant.hover();
    const regenerate = assistant.getByRole('button', { name: 'Regenerate', exact: true }).last();
    await expect(regenerate).toBeVisible({ timeout: 30000 });
    await Promise.all([
      page.waitForResponse(isAgentsStream, { timeout: 30000 }),
      regenerate.click(),
    ]);
    await expect(stopButton(page)).toBeHidden({ timeout: 120000 });
    const latestCode = await expectHighlightedCode(page);
    await expect(latestCode).toContainText('line-119-☃');
  });

  test('restored-history-code-remains-highlighted @scenario:restored-history-code-remains-highlighted', async ({
    page,
  }) => {
    test.setTimeout(180000);
    await openHighlightChat(page);
    await sendMessage(page, 'E2E_HIGHLIGHT_CODE:history');
    await expect(stopButton(page)).toBeHidden({ timeout: 120000 });
    await expectHighlightedCode(page);
    const conversationUrl = page.url();

    await page.reload({ timeout: 10000 });
    await expect(page).toHaveURL(conversationUrl);
    const restoredCode = await expectHighlightedCode(page);
    await expect(restoredCode).toContainText('line-119-☃');
    await expect.poll(() => restoredCode.locator('span').count()).toBeGreaterThan(0);
  });
});
