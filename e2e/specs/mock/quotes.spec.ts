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

/**
 * Double-click the first word of `needle` inside the most recent message
 * containing it, using native mouse events at that word's measured coordinates.
 * Unlike `selectMessageText` (a programmatic Range), this exercises the
 * browser's own double-click word selection — the path the `dblclick` listener
 * guards. Measuring the `needle` text node itself (not the first text node in
 * `.message-render`, which may be a `select-none` screen-reader/model-label
 * header) keeps the click on the actual reply word, not metadata or whitespace.
 */
async function doubleClickWord(page: Page, needle: string) {
  const point = await page.evaluate((text) => {
    const renders = Array.from(document.querySelectorAll('.message-render'));
    const host = [...renders].reverse().find((el) => (el.textContent ?? '').includes(text));
    if (!host) {
      throw new Error(`No message contains: ${text}`);
    }
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node && !(node.nodeValue ?? '').includes(text)) {
      node = walker.nextNode();
    }
    if (!node) {
      throw new Error(`No text node contains: ${text}`);
    }
    const index = (node.nodeValue ?? '').indexOf(text);
    const range = document.createRange();
    range.setStart(node, index);
    range.setEnd(node, index + 1);
    const r = range.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, needle);
  await page.mouse.dblclick(point.x, point.y);
}

const addToChat = (page: Page) => page.getByTestId('add-to-chat-button');
const pendingChips = (page: Page) => page.getByTestId('pending-quote-chips');
const messageQuotes = (page: Page) => messagesView(page).getByTestId('message-quotes');

/** The mock model echoes this when a blockquote containing the token reached the prompt. */
const QUOTE_ASSERTION_PASSED = 'E2E quote assertion passed: reply';

/**
 * Select `needle` inside a message and add it as a quote, asserting the pending
 * chip count reaches `expectedCount`. Retried as a unit: a pending selection is
 * dismissed on any scroll/layout shift (e.g. auto-scroll after a new message),
 * which is correct UX but races with a scripted select+click — `toPass` re-runs
 * the select+click until the chip commits. Dedup keeps re-runs idempotent.
 */
async function addQuote(page: Page, needle: string, expectedCount: number) {
  await expect(async () => {
    await selectMessageText(page, needle);
    const button = addToChat(page);
    await expect(button).toBeVisible({ timeout: 3000 });
    await button.click();
    await expect(pendingChips(page)).toHaveAttribute('data-quote-count', String(expectedCount));
  }).toPass({ timeout: 30000 });
}

test.describe('quote references', () => {
  test('merges a quoted excerpt into the model turn, pins it to the message, and persists across reload', async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
    await selectMockEndpoint(page, MOCK_ENDPOINTS[0]);

    // Seed an assistant reply to quote.
    let response = await sendMessage(page, 'seed for quote');
    expect(response.ok()).toBeTruthy();
    await expect(mockReply(page)).toBeVisible({ timeout: 20000 });

    // Select the reply text -> popup -> chip above the composer.
    await addQuote(page, MOCK_REPLY_TEXT, 1);
    await expect(pendingChips(page)).toContainText(MOCK_REPLY_TEXT);

    // Send a turn that asks the mock model to confirm the quote reached the prompt.
    response = await sendMessage(page, 'E2E_ASSERT_QUOTE:reply');
    expect(response.ok()).toBeTruthy();

    // The model received the merged blockquote (verified server-side by the mock).
    await expect(messagesView(page).getByText(QUOTE_ASSERTION_PASSED)).toBeVisible({
      timeout: 20000,
    });
    // Pending chips drained; the reference is pinned to the sent user message.
    await expect(pendingChips(page)).toHaveCount(0);
    await expect(messageQuotes(page)).toContainText(MOCK_REPLY_TEXT);

    // Round-trips through the DB: still pinned after reload.
    await expect(page).toHaveURL(/\/c\/(?!new)/, { timeout: 15000 });
    const conversationUrl = page.url();
    await page.reload({ timeout: 10000 });
    await expect(page).toHaveURL(conversationUrl);
    await expect(messageQuotes(page)).toContainText(MOCK_REPLY_TEXT);
  });

  test('summons the popup from a native double-click word selection', async ({ page }) => {
    test.setTimeout(120000);
    await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
    await selectMockEndpoint(page, MOCK_ENDPOINTS[0]);

    const response = await sendMessage(page, 'seed for dblclick');
    expect(response.ok()).toBeTruthy();
    await expect(mockReply(page)).toBeVisible({ timeout: 20000 });

    // A real double-click selects the word under the cursor. Chromium commits
    // that selection on `dblclick`, AFTER `mouseup` fires, so only a `dblclick`
    // listener catches it — a programmatic Range (the other tests) would bypass
    // this path entirely. Retried as a unit: auto-scroll can clear a fresh
    // selection, which races the scripted double-click.
    await expect(async () => {
      await doubleClickWord(page, MOCK_REPLY_TEXT);
      const button = addToChat(page);
      await expect(button).toBeVisible({ timeout: 3000 });
      await button.click();
      await expect(pendingChips(page)).toHaveAttribute('data-quote-count', '1');
    }).toPass({ timeout: 30000 });

    // The quoted excerpt is a word from the reply, not empty.
    await expect(pendingChips(page)).toContainText(/E2E|mock|reply/i);
  });

  test('hides the popup when the selection collapses without a mouse event', async ({ page }) => {
    test.setTimeout(120000);
    await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
    await selectMockEndpoint(page, MOCK_ENDPOINTS[0]);

    const response = await sendMessage(page, 'seed for collapse');
    expect(response.ok()).toBeTruthy();
    await expect(mockReply(page)).toBeVisible({ timeout: 20000 });

    await expect(async () => {
      await doubleClickWord(page, MOCK_REPLY_TEXT);
      await expect(addToChat(page)).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 30000 });

    // Collapse the selection the way a streaming markdown re-render does —
    // dropping the selected text node fires only `selectionchange`, not a
    // mouse/key event. The popup must not linger over the now-empty caret.
    await page.evaluate(() => window.getSelection()?.collapseToEnd());
    await expect(addToChat(page)).toBeHidden({ timeout: 5000 });
  });

  test('collapses multiple selections into one chip with a hover popup, and removes one', async ({
    page,
  }) => {
    test.setTimeout(120000);
    const firstMessage = 'quote target alpha';
    const popup = page.getByTestId('quote-selections-popup');

    await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
    await selectMockEndpoint(page, MOCK_ENDPOINTS[0]);

    const response = await sendMessage(page, firstMessage);
    expect(response.ok()).toBeTruthy();
    await expect(mockReply(page)).toBeVisible({ timeout: 20000 });

    // First the assistant reply, then the user's own message.
    await addQuote(page, MOCK_REPLY_TEXT, 1);
    await addQuote(page, firstMessage, 2);

    // Composer shows a single collapsed "2 selections" chip, not a row of two.
    await expect(pendingChips(page)).toContainText('2 selections');

    // Hovering the collapsed chip reveals a popup listing every excerpt.
    await pendingChips(page).getByRole('listitem').hover();
    await expect(popup).toBeVisible({ timeout: 5000 });
    await expect(popup).toContainText(MOCK_REPLY_TEXT);
    await expect(popup).toContainText(firstMessage);

    // Remove the reply from the popup; one selection remains and collapses back
    // to its excerpt text.
    await popup
      .getByRole('listitem')
      .filter({ hasText: MOCK_REPLY_TEXT })
      .getByRole('button', { name: /remove quote/i })
      .click();
    await expect(pendingChips(page)).toHaveAttribute('data-quote-count', '1');
    await expect(pendingChips(page)).toContainText(firstMessage);
    await expect(pendingChips(page)).not.toContainText(MOCK_REPLY_TEXT);

    // Send; only the remaining quote pins to the new user message.
    const followUp = await sendMessage(page, 'expand on this');
    expect(followUp.ok()).toBeTruthy();
    await expect(messageQuotes(page)).toContainText(firstMessage);
    await expect(messageQuotes(page)).not.toContainText(MOCK_REPLY_TEXT);
  });

  test('opens the selections popup via keyboard and closes on Escape', async ({ page }) => {
    test.setTimeout(120000);
    const firstMessage = 'quote target beta';
    const popup = page.getByTestId('quote-selections-popup');

    await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
    await selectMockEndpoint(page, MOCK_ENDPOINTS[0]);

    const response = await sendMessage(page, firstMessage);
    expect(response.ok()).toBeTruthy();
    await expect(mockReply(page)).toBeVisible({ timeout: 20000 });
    await addQuote(page, MOCK_REPLY_TEXT, 1);
    await addQuote(page, firstMessage, 2);

    // The collapsed pill is a focusable disclosure: focus + Enter opens it.
    const trigger = pendingChips(page).getByRole('button', { name: '2 selections' });
    await trigger.focus();
    await expect(trigger).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(popup).toBeVisible({ timeout: 5000 });
    await expect(popup).toContainText(MOCK_REPLY_TEXT);
    await expect(popup).toContainText(firstMessage);

    // Opening via keyboard moves focus into the popup (first excerpt's remove ×).
    await expect(popup.getByRole('button').first()).toBeFocused();

    // Escape closes it and returns focus to the composer (NOT the page top, the
    // bug this guards against). `document.activeElement` must be a real control.
    await page.keyboard.press('Escape');
    await expect(popup).toBeHidden();
    await expect(page.getByRole('textbox', { name: 'Message input' })).toBeFocused();
    const focusTag = await page.evaluate(() => document.activeElement?.tagName ?? 'NONE');
    expect(focusTag).not.toBe('BODY');
  });

  test('re-merges a persisted quote into later-turn history (durable)', async ({ page }) => {
    test.setTimeout(120000);
    await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
    await selectMockEndpoint(page, MOCK_ENDPOINTS[0]);

    // Turn 1: quote the assistant reply and send a (labeled) message carrying it.
    let response = await sendMessage(page, 'seed for durable');
    expect(response.ok()).toBeTruthy();
    await expect(mockReply(page)).toBeVisible({ timeout: 20000 });
    await addQuote(page, MOCK_REPLY_TEXT, 1);
    response = await sendMessage(page, 'E2E_REPLY:carryquote');
    expect(response.ok()).toBeTruthy();
    // Wait for turn 1's generation to fully finish before sending again — a new
    // submit is blocked while the prior turn is still streaming.
    await expect(messagesView(page).getByText('E2E reply carryquote')).toBeVisible({
      timeout: 20000,
    });
    await expect(messageQuotes(page)).toContainText(MOCK_REPLY_TEXT);

    // Turn 2: no new quote. The prior quoted turn must be re-merged into history,
    // so the model still receives the blockquote on this later turn.
    response = await sendMessage(page, 'E2E_ASSERT_QUOTE:reply');
    expect(response.ok()).toBeTruthy();
    await expect(messagesView(page).getByText(QUOTE_ASSERTION_PASSED)).toBeVisible({
      timeout: 20000,
    });
  });
});
