import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { getE2EUser } from '../../../setup/user';
import {
  deleteConversations,
  deleteMessagesByConversation,
  seedConversations,
  seedMessages,
} from '../db';
import type { SeedMessage } from '../db';
import { messagesView, sendMessageAndWaitForCompletion } from '../helpers';

const userEmail = getE2EUser().email;
const ROOT_PARENT = '00000000-0000-0000-0000-000000000000';

/**
 * A branch whose last turn carries a summary part, seeded straight into Mongo:
 * a summarize round that streamed deltas and then errored cannot be produced
 * through the composer, and the point here is what the *next* turn sends once
 * such a turn is persisted.
 */
async function seedBranchEndingInSummary(summaryPart: Record<string, unknown>) {
  const conversationId = randomUUID();
  const token = `OLDFACT-${randomUUID().slice(0, 8)}`;
  const askId = randomUUID();
  const answerId = randomUUID();
  const summaryId = randomUUID();
  const messages: SeedMessage[] = [
    {
      messageId: askId,
      parentMessageId: ROOT_PARENT,
      text: `Remember this passphrase: ${token}`,
      isCreatedByUser: true,
      sender: 'User',
    },
    {
      messageId: answerId,
      parentMessageId: askId,
      text: 'Noted the passphrase.',
      isCreatedByUser: false,
      sender: 'OpenAI',
    },
    {
      messageId: summaryId,
      parentMessageId: answerId,
      text: '',
      isCreatedByUser: false,
      sender: 'OpenAI',
      content: [summaryPart],
    },
  ];
  await seedConversations(userEmail, [
    { conversationId, title: `Summary ${conversationId.slice(0, 8)}`, updatedAt: new Date() },
  ]);
  await seedMessages(userEmail, conversationId, messages);
  return { conversationId, token };
}

const summaryPart = (text: string, extra: Record<string, unknown> = {}) => ({
  type: 'summary',
  content: [{ type: 'text', text }],
  tokenCount: 6,
  ...extra,
});

test.describe('failed summary history', () => {
  const conversationIds: string[] = [];

  test.afterEach(async () => {
    const ids = conversationIds.splice(0);
    if (ids.length === 0) {
      return;
    }
    try {
      await deleteMessagesByConversation(ids);
    } finally {
      await deleteConversations(ids);
    }
  });

  /**
   * A summarize round that errored keeps the deltas it streamed and is stamped
   * `failed: true`. Treating that prefix as the conversation's checkpoint drops
   * every turn it never summarized, so the passphrase from the opening turn has
   * to still reach the model on the turn after it.
   */
  test('a turn after a failed summarization still sends the earlier history @scenario:failed-summary-keeps-prior-history', async ({
    page,
  }) => {
    const { conversationId, token } = await seedBranchEndingInSummary(
      summaryPart('Partial summary of the conve', { failed: true }),
    );
    conversationIds.push(conversationId);

    await page.goto(`/c/${conversationId}`);
    await expect(messagesView(page).getByText(token)).toBeVisible();

    await sendMessageAndWaitForCompletion(page, `E2E_ASSERT_HISTORY:${token}`);

    await expect(
      messagesView(page).getByText(`E2E history assertion present: ${token}`),
    ).toBeVisible({ timeout: 30000 });
  });

  /**
   * The other half of the same invariant: a summary that completed is still the
   * conversation's checkpoint, so the turns it covers are replaced by it and
   * the passphrase no longer reaches the model.
   */
  test('a completed summary still replaces the history it covers @scenario:complete-summary-replaces-prior-history', async ({
    page,
  }) => {
    const { conversationId, token } = await seedBranchEndingInSummary(
      summaryPart('The user shared a passphrase and it was acknowledged.'),
    );
    conversationIds.push(conversationId);

    await page.goto(`/c/${conversationId}`);
    await expect(messagesView(page).getByText(token)).toBeVisible();

    await sendMessageAndWaitForCompletion(page, `E2E_ASSERT_HISTORY:${token}`);

    await expect(messagesView(page).getByText(`E2E history assertion absent: ${token}`)).toBeVisible(
      { timeout: 30000 },
    );
  });
});
