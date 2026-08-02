import { expect, test } from '@playwright/test';
import type { Page, Response } from '@playwright/test';
import {
  MOCK_ENDPOINTS,
  NEW_CHAT_PATH,
  messagesView,
  replyPrompt,
  replyText,
  selectMockEndpoint,
  sendMessage,
} from './helpers';

/**
 * Regression suite for the "folded thread" incident (PR: order-robust message
 * tree + identity-stable sibling selection). The original failure: after
 * preempt/interrupt churn completed a turn, the client cache held children
 * ordered before their parent and the thread view collapsed to the latest
 * branch (with a correct-looking sibling counter) until a reload. These tests
 * pin the user-visible invariants on the real stack: every turn stays visible
 * through churn, the rendered thread matches its own post-reload rendering,
 * and paging to an older branch is not undone by later tree writes.
 */

const uniqueLabel = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;

const countedPrompt = (label: string) => `E2E_COUNTED_REPLY:${label}`;
const countedReplyText = (label: string, count: number) => `E2E counted reply ${label} #${count}`;

const messageInput = (page: Page) => page.getByRole('textbox', { name: 'Message input' });
const messageTurns = (page: Page) => messagesView(page).locator('.message-render');
const siblingCounter = (page: Page) =>
  page.getByRole('navigation', { name: 'Sibling message navigation' }).getByRole('status').first();

function isSteerRequest(response: Response) {
  return (
    response.request().method() === 'POST' &&
    new URL(response.url()).pathname === '/api/agents/chat/steer'
  );
}

async function openMockChat(page: Page) {
  await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
  await selectMockEndpoint(page, MOCK_ENDPOINTS[0]);
}

async function sendAndExpectReply(page: Page, prompt: string, reply: string) {
  const response = await sendMessage(page, prompt);
  expect(response.ok()).toBeTruthy();
  await expect(messagesView(page).getByText(reply)).toBeVisible({ timeout: 30000 });
}

async function clickSibling(page: Page, messageTextValue: string, direction: 'Previous' | 'Next') {
  const render = messagesView(page)
    .locator('.message-render')
    .filter({ hasText: messageTextValue })
    .last();
  await render.scrollIntoViewIfNeeded();
  await render.hover();
  await render.getByRole('button', { name: `${direction} sibling message` }).click();
}

test.describe('thread fold regressions', () => {
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => window.localStorage.removeItem('steerInterruptsByDefault'));
  });

  test('thread survives a mid-stream interrupt and matches its own post-reload rendering', async ({
    page,
  }) => {
    test.setTimeout(180000);
    const label = uniqueLabel('fold-churn');
    const setupPrompt = replyPrompt(`${label}-setup`);
    const setupReply = replyText(`${label}-setup`);
    const interruptText = `Interrupt churn ${label}`;

    await openMockChat(page);
    await sendAndExpectReply(page, setupPrompt, setupReply);
    await expect(page).toHaveURL(/\/c\/[0-9a-fA-F-]{36}$/, { timeout: 15000 });

    const run = await sendMessage(page, `E2E_SLOW_REPLY:${label}`);
    expect(run.ok()).toBeTruthy();
    await expect(messagesView(page).getByText('chunk-010')).toBeVisible({ timeout: 15000 });

    /** Queue mid-run, then escalate to an interrupt: the closest scripted
     *  reproduction of the incident's preempt churn (mid-stream seal, new
     *  generation, resume-path cache writes). */
    const input = messageInput(page);
    await input.click();
    await input.fill(interruptText);
    await input.press('ControlOrMeta+Enter');
    const row = page.getByTestId('queued-message-row').filter({ hasText: interruptText });
    await expect(row).toBeVisible({ timeout: 10000 });

    const [steerResponse] = await Promise.all([
      page.waitForResponse(isSteerRequest, { timeout: 15000 }),
      row.getByTestId('queued-interrupt-now').click(),
    ]);
    expect(steerResponse.status()).toBe(202);

    await expect(
      messagesView(page).getByTestId('steer-part').filter({ hasText: interruptText }),
    ).toHaveCount(1, { timeout: 90000 });
    await expect(messagesView(page).getByText(`E2E slow reply continued ${label}`)).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByRole('button', { name: 'Stop generating' })).toBeHidden({
      timeout: 30000,
    });

    /** The fold's fingerprint was a live rendering that no longer matched the
     *  durable thread. EVERY turn must still be on screen after the churn... */
    await expect(messagesView(page).getByText(setupPrompt)).toBeVisible();
    await expect(messagesView(page).getByText(setupReply)).toBeVisible();
    await expect(messagesView(page).getByText('chunk-010')).toBeVisible();
    await expect(messageTurns(page)).toHaveCount(4);

    /** ...and reloading (the incident's only fix) must change nothing. */
    await page.reload({ timeout: 15000 });
    await expect(messagesView(page).getByText(setupPrompt)).toBeVisible({ timeout: 30000 });
    await expect(messagesView(page).getByText(setupReply)).toBeVisible();
    await expect(messagesView(page).getByText('chunk-010')).toBeVisible();
    await expect(
      messagesView(page).getByTestId('steer-part').filter({ hasText: interruptText }),
    ).toHaveCount(1, { timeout: 30000 });
    await expect(messageTurns(page)).toHaveCount(4);
  });

  test('older-branch selection and sibling counters survive a follow-up turn and reload', async ({
    page,
  }) => {
    test.setTimeout(180000);
    const label = uniqueLabel('fold-branch');
    const rootPrompt = countedPrompt(label);
    const firstReply = countedReplyText(label, 1);
    const regeneratedReply = countedReplyText(label, 2);
    const followPrompt = replyPrompt(`${label}-follow`);
    const followReply = replyText(`${label}-follow`);

    await openMockChat(page);
    await sendAndExpectReply(page, rootPrompt, firstReply);
    await expect(page).toHaveURL(/\/c\/[0-9a-fA-F-]{36}$/, { timeout: 15000 });

    const render = messagesView(page)
      .locator('.message-render')
      .filter({ hasText: firstReply })
      .last();
    await render.hover();
    await render.locator('button[title="Regenerate"]').last().click();
    await expect(messagesView(page).getByText(regeneratedReply)).toBeVisible({ timeout: 30000 });
    await expect(siblingCounter(page)).toHaveText('2 / 2');

    /** Page to the older branch; the selection must hold, not snap back. */
    await clickSibling(page, regeneratedReply, 'Previous');
    await expect(messagesView(page).getByText(firstReply)).toBeVisible();
    await expect(messagesView(page).getByText(regeneratedReply)).toBeHidden();
    await expect(siblingCounter(page)).toHaveText('1 / 2');

    /** A follow-up streamed from the older branch churns the tree on every
     *  delta and appends a deeper level — none of which may move THIS level's
     *  selection or corrupt its counter. */
    await sendAndExpectReply(page, followPrompt, followReply);
    await expect(messagesView(page).getByText(firstReply)).toBeVisible();
    await expect(messagesView(page).getByText(regeneratedReply)).toBeHidden();
    await expect(siblingCounter(page)).toHaveText('1 / 2');

    /** Reload rebuilds selection from scratch (in-memory sibling atoms are
     *  gone); whichever branch the default lands on, the durable tree must be
     *  intact: both branches reachable through the switcher and the follow-up
     *  turn present on branch one. A folded tree would strand one branch. */
    await page.reload({ timeout: 15000 });
    await expect(siblingCounter(page)).toHaveText(/[12] \/ 2/, { timeout: 30000 });
    if (!(await messagesView(page).getByText(followReply).isVisible())) {
      await clickSibling(page, regeneratedReply, 'Previous');
    }
    await expect(messagesView(page).getByText(followReply)).toBeVisible({ timeout: 15000 });
    await expect(messagesView(page).getByText(firstReply)).toBeVisible();
    await expect(siblingCounter(page)).toHaveText('1 / 2');
    await clickSibling(page, firstReply, 'Next');
    await expect(messagesView(page).getByText(regeneratedReply)).toBeVisible();
    await expect(messagesView(page).getByText(followReply)).toBeHidden();
    await expect(siblingCounter(page)).toHaveText('2 / 2');
  });
});
