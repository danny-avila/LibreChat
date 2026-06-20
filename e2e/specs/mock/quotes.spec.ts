import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  MOCK_ENDPOINTS,
  MOCK_REPLY_TEXT,
  NEW_CHAT_PATH,
  messagesView,
  mockReply,
  selectMockEndpoint,
  sendMessage,
} from './helpers';

/**
 * Place a real DOM Selection over `needle` inside the most recent
 * `.message-render` that contains it, then dispatch `mouseup` so the
 * `QuoteButton` listener fires — the deterministic equivalent of a user
 * drag-selecting that text to summon the "Add to chat" popup.
 */
async function selectMessageText(page: Page, needle: string) {
  await page.evaluate((text) => {
    const renders = Array.from(document.querySelectorAll('.message-render'));
    const host = [...renders].reverse().find((el) => (el.textContent ?? '').includes(text));
    if (!host) {
      throw new Error(`No message contains: ${text}`);
    }
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const value = node.nodeValue ?? '';
      const index = value.indexOf(text);
      if (index !== -1) {
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + text.length);
        const selection = window.getSelection();
        if (!selection) {
          throw new Error('Selection API unavailable');
        }
        selection.removeAllRanges();
        selection.addRange(range);
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        return;
      }
      node = walker.nextNode();
    }
    throw new Error(`No text node contains: ${text}`);
  }, needle);
}

const addToChat = (page: Page) => page.getByTestId('add-to-chat-button');
const pendingChips = (page: Page) => page.getByTestId('pending-quote-chips');
const messageQuotes = (page: Page) => messagesView(page).getByTestId('message-quotes');

test.describe('quote references', () => {
  test('quotes a message excerpt, pins it to the sent message, and persists across reload', async ({
    page,
  }) => {
    test.setTimeout(120000);
    const followUp = 'what did you mean by that?';

    await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
    await selectMockEndpoint(page, MOCK_ENDPOINTS[0]);

    // Seed an assistant reply we can quote.
    let response = await sendMessage(page, 'quote target one');
    expect(response.ok()).toBeTruthy();
    await expect(mockReply(page)).toBeVisible({ timeout: 20000 });

    // Select the reply text -> popup -> add a quote chip above the composer.
    await selectMessageText(page, MOCK_REPLY_TEXT);
    await expect(addToChat(page)).toBeVisible({ timeout: 10000 });
    await addToChat(page).click();
    await expect(pendingChips(page)).toContainText(MOCK_REPLY_TEXT);

    // Send a follow-up; the quote rides along and the pending chips drain.
    response = await sendMessage(page, followUp);
    expect(response.ok()).toBeTruthy();
    await expect(page.getByText(followUp)).toBeVisible();
    await expect(pendingChips(page)).toHaveCount(0);

    // The reference renders persistently on the sent user message.
    await expect(messageQuotes(page)).toBeVisible();
    await expect(messageQuotes(page)).toContainText(MOCK_REPLY_TEXT);

    // Round-trips through the DB: still there after reload.
    await expect(page).toHaveURL(/\/c\/(?!new)/, { timeout: 15000 });
    const conversationUrl = page.url();
    await page.reload({ timeout: 10000 });
    await expect(page).toHaveURL(conversationUrl);
    await expect(messageQuotes(page)).toContainText(MOCK_REPLY_TEXT);
  });

  test('accumulates multiple selections as chips and supports removing one', async ({ page }) => {
    test.setTimeout(120000);
    const firstMessage = 'quote target alpha';

    await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
    await selectMockEndpoint(page, MOCK_ENDPOINTS[0]);

    const response = await sendMessage(page, firstMessage);
    expect(response.ok()).toBeTruthy();
    await expect(mockReply(page)).toBeVisible({ timeout: 20000 });

    // First selection: the assistant reply.
    await selectMessageText(page, MOCK_REPLY_TEXT);
    await expect(addToChat(page)).toBeVisible({ timeout: 10000 });
    await addToChat(page).click();

    // Second selection: the user's own earlier message.
    await selectMessageText(page, firstMessage);
    await expect(addToChat(page)).toBeVisible({ timeout: 10000 });
    await addToChat(page).click();

    await expect(pendingChips(page).getByRole('listitem')).toHaveCount(2);

    // Remove the reply chip; the user-message chip remains.
    await pendingChips(page)
      .getByRole('listitem')
      .filter({ hasText: MOCK_REPLY_TEXT })
      .getByRole('button', { name: /remove quote/i })
      .click();
    await expect(pendingChips(page).getByRole('listitem')).toHaveCount(1);
    await expect(pendingChips(page)).toContainText(firstMessage);
    await expect(pendingChips(page)).not.toContainText(MOCK_REPLY_TEXT);

    // Send; only the remaining quote pins to the new user message.
    const followUp = await sendMessage(page, 'expand on this');
    expect(followUp.ok()).toBeTruthy();
    await expect(messageQuotes(page)).toContainText(firstMessage);
    await expect(messageQuotes(page)).not.toContainText(MOCK_REPLY_TEXT);
  });
});
