import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  MOCK_ENDPOINTS,
  NEW_CHAT_PATH,
  messagesView,
  replyPrompt,
  replyText,
  selectMockEndpoint,
  sendMessage,
} from './helpers';

const uniqueLabel = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;

const messageInput = (page: Page) => page.getByRole('textbox', { name: 'Message input' });
const duringRunSendButton = (page: Page) => page.getByTestId('during-run-send-button');
const queuedRows = (page: Page) => page.getByTestId('queued-message-row');
const messageTurns = (page: Page) => messagesView(page).locator('.message-render');
const outboxGroup = (page: Page) => page.getByTestId('queue-group');
const outboxToggle = (page: Page) => page.getByTestId('queue-group-toggle');

async function establishConversation(page: Page, label: string) {
  const setup = await sendMessage(page, replyPrompt(label));
  expect(setup.ok()).toBeTruthy();
  await expect(messagesView(page).getByText(replyText(label))).toBeVisible({ timeout: 30000 });
  await expect(page).toHaveURL(/\/c\/[0-9a-fA-F-]{36}$/, { timeout: 15000 });
}

/** Fill the composer mid-run: the during-run send button must take the
 *  send/stop slot (it becomes the form submit target for Enter). */
async function typeDuringRun(page: Page, text: string) {
  const input = messageInput(page);
  await input.click();
  await input.fill(text);
  await expect(duringRunSendButton(page)).toBeVisible({ timeout: 5000 });
}

/** Ctrl/Cmd+Enter routes to the non-default during-run action (queue). */
async function queueDuringRun(page: Page, text: string) {
  await typeDuringRun(page, text);
  await messageInput(page).press('ControlOrMeta+Enter');
}

/** Starts a slow run and parks `texts` in the queue behind it. */
async function queueBehindSlowRun(page: Page, label: string, texts: string[]) {
  await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
  await selectMockEndpoint(page, MOCK_ENDPOINTS[0]);
  await establishConversation(page, `outbox-setup-${label}`);

  const run = await sendMessage(page, `E2E_SLOW_REPLY:${label}`);
  expect(run.ok()).toBeTruthy();
  await expect(messagesView(page).getByText('chunk-010')).toBeVisible({ timeout: 15000 });

  for (const text of texts) {
    await queueDuringRun(page, text);
  }
}

test.describe('queued message outbox', () => {
  /**
   * Two or more waiting messages collapse into one row so the composer stops
   * growing with queue depth; the managed list lives in the expansion.
   */
  test('groups queued messages behind one row and expands to manage them', async ({ page }) => {
    test.setTimeout(120000);
    const label = uniqueLabel('outbox-group');
    const first = `First queued ${label}`;
    const second = `Second queued ${label}`;

    await queueBehindSlowRun(page, label, [first, second]);

    // Collapsed: one summary row, the individual rows are not mounted.
    await expect(outboxGroup(page)).toBeVisible({ timeout: 10000 });
    await expect(outboxToggle(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(outboxToggle(page)).toContainText('2 queued');
    await expect(outboxToggle(page)).toContainText(first);
    await expect(queuedRows(page)).toHaveCount(0);

    await outboxToggle(page).click();
    await expect(outboxToggle(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(queuedRows(page)).toHaveCount(2);
    await expect(queuedRows(page).nth(0)).toContainText(first);
    await expect(queuedRows(page).nth(1)).toContainText(second);

    // Both still drain, in order, after the run completes.
    await expect(queuedRows(page)).toHaveCount(0, { timeout: 90000 });
    const turns = messageTurns(page);
    await expect(turns.filter({ hasText: first })).toHaveCount(1, { timeout: 60000 });
    await expect(turns.filter({ hasText: second })).toHaveCount(1, { timeout: 60000 });
  });

  /** "Send next" promotes a waiting row past the one in front of it. */
  test('send next changes which queued message drains first', async ({ page }) => {
    test.setTimeout(120000);
    const label = uniqueLabel('outbox-bump');
    const first = `Typed first ${label}`;
    const second = `Wanted first ${label}`;

    await queueBehindSlowRun(page, label, [first, second]);
    await outboxToggle(page).click();
    await expect(queuedRows(page)).toHaveCount(2);

    // The front row is already next, so only the second offers the promotion.
    const bump = page.getByTestId('queued-send-next');
    await expect(bump).toHaveCount(1);
    await bump.click();

    await expect(queuedRows(page).nth(0)).toContainText(second);
    await expect(queuedRows(page).nth(1)).toContainText(first);

    // Drain order follows the rendered order: the promoted message sends first.
    await expect(queuedRows(page)).toHaveCount(0, { timeout: 90000 });
    const userTurns = messagesView(page).locator('.user-turn');
    await expect(userTurns.filter({ hasText: first })).toHaveCount(1, { timeout: 60000 });
    const sent = await userTurns.allInnerTexts();
    const promotedIndex = sent.findIndex((text) => text.includes(second));
    const typedIndex = sent.findIndex((text) => text.includes(first));
    expect(promotedIndex).toBeGreaterThanOrEqual(0);
    expect(promotedIndex).toBeLessThan(typedIndex);
  });

  /**
   * Burst-typed fragments are usually one thought, and every extra turn costs a
   * full model round trip — merging sends them as a single turn.
   */
  test('merge folds the queue into a single turn', async ({ page }) => {
    test.setTimeout(120000);
    const label = uniqueLabel('outbox-merge');
    const first = `Fragment one ${label}`;
    const second = `Fragment two ${label}`;

    await queueBehindSlowRun(page, label, [first, second]);
    await outboxToggle(page).click();
    await page.getByTestId('queue-merge').click();

    // One row now holds both texts, so the group collapses back to a chip.
    await expect(outboxGroup(page)).toHaveCount(0);
    const merged = queuedRows(page);
    await expect(merged).toHaveCount(1);
    await expect(merged).toContainText(first);

    await expect(queuedRows(page)).toHaveCount(0, { timeout: 90000 });
    // ONE user turn carries both fragments, rather than two turns.
    const mergedTurn = messagesView(page).locator('.user-turn').filter({ hasText: first });
    await expect(mergedTurn).toHaveCount(1, { timeout: 60000 });
    await expect(mergedTurn).toContainText(second);
  });

  /**
   * The automatic send is withheld briefly at run end. Undo cancels it without
   * touching the queue, so the words stay put for a manual send.
   */
  test('undo takes back the automatic send and keeps the message queued', async ({ page }) => {
    test.setTimeout(120000);
    const label = uniqueLabel('outbox-undo');
    const queued = `Held back ${label}`;

    await queueBehindSlowRun(page, label, [queued]);
    await expect(queuedRows(page)).toHaveCount(1, { timeout: 10000 });

    // The banner only appears once the run ends and the send is pending. The
    // window is deliberately short, so wait on the mutation rather than a
    // polling assertion and click the moment it lands.
    const undo = page.getByTestId('queue-undo-send');
    await undo.waitFor({ state: 'visible', timeout: 90000 });
    await undo.click({ timeout: 2000 });

    await expect(page.getByTestId('queue-sending-banner')).toHaveCount(0);
    // Still queued, and no follow-up turn was sent.
    await expect(queuedRows(page)).toHaveCount(1);
    await expect(queuedRows(page)).toContainText(queued);
    await expect(messagesView(page).locator('.user-turn').filter({ hasText: queued })).toHaveCount(
      0,
    );

    // The words are recoverable on demand: Send now starts the turn.
    await page.getByText('Send now', { exact: true }).click();
    await expect(messagesView(page).locator('.user-turn').filter({ hasText: queued })).toHaveCount(
      1,
      { timeout: 60000 },
    );
  });
});
