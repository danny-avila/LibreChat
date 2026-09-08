import { ObjectId } from 'mongodb';
import { expect, test } from '@playwright/test';
import { seedConversations, seedMessages, withMongo } from '../specs/mock/db';
import { getE2EUser } from '../setup/user';
import { auditPage, lcpElement } from './audit';

const conversationId = '16390000-0000-4000-8000-000000000001';
const title = 'Lighthouse latency audit';
const transcriptMarker = 'Serial database latency transcript';

test('serial database latency stays within web-vitals budgets', async ({ page, baseURL }) => {
  const email = getE2EUser().email;
  await seedConversations(email, [{ conversationId, title, updatedAt: new Date() }]);
  await withMongo(async (db) => {
    const conversation = await db.collection('conversations').findOne({ conversationId });
    if (!conversation) {
      throw new Error('Lighthouse conversation was not seeded');
    }
    const tagId = new ObjectId();
    await db.collection('conversationtags').insertOne({
      _id: tagId,
      user: conversation.user,
      tag: 'Lighthouse bookmark',
      position: 0,
    });
    await db
      .collection('conversations')
      .updateOne({ _id: conversation._id }, { $set: { tagIds: [tagId.toHexString()] } });
  });
  await seedMessages(email, conversationId, [
    {
      messageId: '16390000-0000-4000-8000-000000000002',
      parentMessageId: '00000000-0000-0000-0000-000000000000',
      text: 'Explain why independent database reads should start together.',
      isCreatedByUser: true,
      sender: 'User',
    },
    {
      messageId: '16390000-0000-4000-8000-000000000003',
      parentMessageId: '16390000-0000-4000-8000-000000000002',
      text: `${transcriptMarker}. Independent reads can overlap. Serial reads each add another database round trip and delay the visible conversation. Reuse loaded user data and preserve authorization checks when starting reads in parallel.`,
      isCreatedByUser: false,
      sender: 'Assistant',
    },
  ]);
  const url = `${baseURL}/c/${conversationId}`;
  await page.goto(url);
  await expect(page.locator('.message-render').filter({ hasText: transcriptMarker })).toBeVisible();
  const cookies = await page.context().cookies();
  const reports = await auditPage({ url, cookies });
  expect(reports, 'Lighthouse must produce all three reports').toHaveLength(3);
  for (const report of reports) {
    expect(report.finalDisplayedUrl, 'Do not measure a login redirect').toBe(url);
    expect(
      lcpElement(report),
      'The measured LCP must be the seeded transcript, not the shell or a spinner',
    ).toContain(transcriptMarker);
  }
});
