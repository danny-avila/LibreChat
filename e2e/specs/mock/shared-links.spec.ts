import { expect, test } from '@playwright/test';
import { MongoClient } from 'mongodb';
import type { ObjectId } from 'mongodb';
import { applyRuntimeEnv } from '../../setup/runtimeEnv';
import {
  MOCK_ENDPOINTS,
  MOCK_REPLY_TEXT,
  NEW_CHAT_PATH,
  mockReply,
  selectMockEndpoint,
  sendMessage,
} from './helpers';

type MessageDoc = {
  _id: ObjectId;
  conversationId: string;
  text?: string;
  user?: string;
  createdAt?: Date;
};

type LegacySharedLinkDoc = {
  _id?: ObjectId;
  conversationId: string;
  title: string;
  user?: string;
  messages: ObjectId[];
  shareId: string;
  isPublic?: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type AclEntryDoc = {
  _id: ObjectId;
  principalType: string;
  resourceType: string;
  resourceId: ObjectId;
};

const randomSuffix = () => `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

async function connectToE2EDb() {
  applyRuntimeEnv();
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI must be available for shared-links mock e2e tests');
  }

  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  return { client, db: client.db() };
}

async function waitForConversationMessages(
  client: MongoClient,
  conversationId: string,
  userMessage: string,
): Promise<MessageDoc[]> {
  const db = client.db();
  const deadline = Date.now() + 15000;

  while (Date.now() < deadline) {
    const messages = (await db
      .collection<MessageDoc>('messages')
      .find({ conversationId })
      .sort({ createdAt: 1 })
      .toArray()) as MessageDoc[];

    const hasUserMessage = messages.some((message) => message.text?.includes(userMessage));
    const hasMockReply = messages.some((message) => message.text?.includes(MOCK_REPLY_TEXT));
    if (hasUserMessage && hasMockReply) {
      return messages;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for persisted messages for ${conversationId}`);
}

test.describe('shared links', () => {
  test('creates a shared link and preserves legacy public links through runtime migration', async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(120000);
    if (typeof baseURL !== 'string') {
      throw new Error('baseURL must be configured for shared-link mock e2e tests');
    }

    const suffix = randomSuffix();
    const userMessage = `Shared link e2e ${suffix}`;

    await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
    await selectMockEndpoint(page, MOCK_ENDPOINTS[0]);

    const response = await sendMessage(page, userMessage);
    expect(response.ok()).toBeTruthy();
    await expect(page.getByText(userMessage)).toBeVisible();
    await expect(mockReply(page)).toBeVisible();

    await expect(page).toHaveURL(/\/c\/(?!new)[0-9a-fA-F-]{36}$/);
    const conversationUrl = new URL(page.url());
    const conversationId = conversationUrl.pathname.split('/').pop();
    if (!conversationId) {
      throw new Error(`Could not parse conversation id from ${conversationUrl.href}`);
    }

    await page.getByRole('button', { name: 'Export options' }).click();
    await page.getByTestId('share-conversation-menu-item').click();
    await expect(page.getByRole('dialog', { name: 'Share link to chat' })).toBeVisible();

    const [shareResponse] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.request().method() === 'POST' &&
          res.url().includes(`/api/share/${conversationId}`) &&
          res.status() === 200,
        { timeout: 30000 },
      ),
      page.getByRole('button', { name: 'Create link' }).click(),
    ]);
    expect(shareResponse.ok()).toBeTruthy();

    await expect(page.getByTestId('shared-link-url')).toContainText('/share/');
    await expect(page.getByRole('button', { name: 'Manage Access' })).toBeVisible();
    const sharedLinkUrl = (await page.getByTestId('shared-link-url').textContent())?.trim();
    if (!sharedLinkUrl) {
      throw new Error('Expected shared-link URL to be rendered after creating a link');
    }

    await page.goto(new URL(sharedLinkUrl, baseURL).pathname, { timeout: 10000 });
    await expect(page).toHaveURL(/\/share\/.+/);
    await expect(page.getByTestId('messages-view').getByText(userMessage)).toBeVisible();
    await expect(mockReply(page)).toBeVisible();

    const { client, db } = await connectToE2EDb();
    const aclEntries = db.collection<AclEntryDoc>('aclentries');
    const sharedLinks = db.collection<LegacySharedLinkDoc>('sharedlinks');
    const legacyShareId = `legacy-${suffix}`;
    let legacyResourceId: ObjectId | undefined;

    try {
      const messages = await waitForConversationMessages(client, conversationId, userMessage);
      const ownerId = messages.find((message) => message.user)?.user;
      const legacyShare = {
        shareId: legacyShareId,
        conversationId,
        title: `Legacy shared link ${suffix}`,
        ...(ownerId ? { user: ownerId } : {}),
        messages: messages.map((message) => message._id),
        isPublic: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const insertResult = await sharedLinks.insertOne(legacyShare);
      const resourceId = insertResult.insertedId;
      legacyResourceId = resourceId;

      await page.goto(`/share/${legacyShareId}`, { timeout: 10000 });
      await expect(page.getByTestId('messages-view').getByText(userMessage)).toBeVisible();
      await expect(mockReply(page)).toBeVisible();

      await expect
        .poll(
          async () =>
            aclEntries.countDocuments({
              resourceType: 'sharedLink',
              resourceId,
              principalType: 'public',
            }),
          { timeout: 15000 },
        )
        .toBe(1);

      await expect
        .poll(
          async () => {
            const migrated = await sharedLinks.findOne({ _id: resourceId });
            return migrated != null && !Object.prototype.hasOwnProperty.call(migrated, 'isPublic');
          },
          { timeout: 15000 },
        )
        .toBe(true);
    } finally {
      if (legacyResourceId) {
        await Promise.all([
          aclEntries.deleteMany({ resourceId: legacyResourceId }),
          sharedLinks.deleteOne({ _id: legacyResourceId }),
        ]);
      }
      await client.close();
    }
  });
});
