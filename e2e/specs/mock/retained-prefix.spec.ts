import { expect, test } from '@playwright/test';
import type { TMessage } from 'librechat-data-provider';
import {
  MOCK_ENDPOINTS,
  NEW_CHAT_PATH,
  fetchJson,
  getAccessToken,
  isAgentGenerationStart,
  messagesView,
  selectMockEndpoint,
  sendMessageAndWaitForCompletion,
} from './helpers';

for (const stop of [false, true]) {
  test(`retains an edited prefix through reconnect, reload and ${stop ? 'Stop' : 'FINAL'}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(stop ? { width: 390, height: 844 } : { width: 1280, height: 900 });
    await page.goto(NEW_CHAT_PATH);
    await selectMockEndpoint(page, MOCK_ENDPOINTS[0]);
    const label = `retained-${Date.now()}`;
    await sendMessageAndWaitForCompletion(page, `E2E_SLOW_REPLY:${label}`, { timeout: 40_000 });
    const conversationId = new URL(page.url()).pathname.split('/').pop()!;
    const token = await getAccessToken(page);
    const row = messagesView(page).locator('.message-render').last();
    await row.hover();
    await row.locator('button[id^="edit-"]').first().click();
    const prefix = `User-retained-prefix-${label}. `;
    const editor = page.getByRole('region', { name: 'Edit message' }).getByRole('textbox');
    await expect(editor).toBeVisible();
    await editor.fill(prefix);
    await Promise.all([
      page.waitForResponse(isAgentGenerationStart),
      page.getByRole('button', { name: 'Update & rerun' }).click(),
    ]);
    const responseContent = messagesView(page)
      .locator('.message-render')
      .last()
      .locator('.message-content');
    await expect(responseContent).toContainText('chunk-010');
    await expect(responseContent).toContainText(prefix.trim());

    const resumed = page.waitForResponse(
      (response) =>
        response.url().includes('/api/agents/chat/stream/') &&
        new URL(response.url()).searchParams.get('resume') === 'true',
    );
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    expect((await resumed).ok()).toBeTruthy();
    await expect(responseContent).toContainText(prefix.trim());
    await page.reload();
    await expect(responseContent).toContainText(prefix.trim());
    const stopButton = page.getByRole('button', { name: 'Stop generating' });
    if (stop) {
      await stopButton.click();
    }
    await expect(stopButton).toBeHidden({ timeout: 40_000 });
    const chunks = Array.from(
      { length: 160 },
      (_, index) => `chunk-${String(index).padStart(3, '0')}`,
    ).join(' ');
    const completeText = `${prefix}E2E slow reply ${label} ${chunks}`;
    if (!stop) {
      await expect(responseContent).toHaveText(completeText);
    }
    expect((await responseContent.innerText()).split(prefix.trim())).toHaveLength(2);

    await expect
      .poll(async () => {
        const messages = await fetchJson<TMessage[]>(
          page,
          `/api/messages/${conversationId}`,
          token,
        );
        const response = messages.find(
          (message) =>
            !message.isCreatedByUser &&
            JSON.stringify(message.content ?? []).includes(prefix.trim()),
        );
        return response == null
          ? null
          : {
              copies: JSON.stringify(response.content).split(prefix.trim()).length - 1,
              unfinished: response.unfinished === true,
            };
      })
      .toEqual({ copies: 1, unfinished: stop });
    await page.reload();
    await expect(responseContent).toContainText(prefix.trim());
    expect((await responseContent.innerText()).split(prefix.trim())).toHaveLength(2);
    if (!stop) {
      await expect(responseContent).toHaveText(completeText);
    }
  });
}
