import { expect, test } from '@playwright/test';
import type { TMessage } from 'librechat-data-provider';
import { withMongo } from './db';
import {
  loginAdmin,
  setRuntimeFilters,
  restoreRuntimeFilters,
  requestResult,
} from './content-filters.helpers';
import {
  MOCK_ENDPOINTS,
  selectMockEndpoint,
  sendMessageAndWaitForCompletion,
  messagesView,
  fetchJson,
} from './helpers';

const original = 'E2E_PRIVATE_TEXT: alice@example.com';

test('owner sees original after reload while provider, sharing, and canonical reads stay filtered', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120000);
  const token = await loginAdmin(request);
  await setRuntimeFilters(request, token, {
    messages: {
      pii: {
        action: 'redact',
        fields: ['text'],
        starterPatterns: [],
        customPatterns: [
          { id: 'email', label: 'Email', regex: 'alice@example\\.com', category: 'email' },
        ],
      },
    },
  });
  let conversationId: string | undefined;
  try {
    await page.goto('/c/new');
    await selectMockEndpoint(page, MOCK_ENDPOINTS[0]);
    const response = await sendMessageAndWaitForCompletion(page, original);
    conversationId = (await response.json()).conversationId as string;
    expect(conversationId).toBeTruthy();
    await expect(
      messagesView(page).getByText('E2E private model input verified', { exact: true }),
    ).toBeVisible();
    await expect(messagesView(page).getByText(original, { exact: true })).toBeVisible();
    await expect(
      messagesView(page).getByText('Private details hidden from the model', { exact: true }),
    ).toBeVisible();

    const replay = await requestResult(request, {
      path: new URL(response.url()).pathname,
      token,
      method: 'POST',
      data: response.request().postDataJSON(),
    });
    expect(replay.ok).toBe(true);
    expect((replay.body as { conversationId: string }).conversationId).toBe(conversationId);

    const canonical = await fetchJson<TMessage[]>(page, `/api/messages/${conversationId}`, token);
    expect(JSON.stringify(canonical)).not.toContain('alice@example.com');
    expect(JSON.stringify(canonical)).not.toContain('privateText');
    const user = canonical.find((message) => message.isCreatedByUser)!;
    expect(user.text).toMatch(/\[EMAIL_1_[a-f0-9]{32}\]/);
    await withMongo(async (db) => {
      const row = await db
        .collection('messages')
        .findOne({ conversationId, messageId: user.messageId });
      expect(row?.privateText).toMatch(/^v1:/);
      expect(JSON.stringify(row)).not.toContain('alice@example.com');
    });

    await page.reload();
    await expect(messagesView(page).getByText(original, { exact: true })).toBeVisible();
    for (const theme of ['light', 'dark']) {
      await page.evaluate(
        (dark) => document.documentElement.classList.toggle('dark', dark),
        theme === 'dark',
      );
      await page.screenshot({
        path: testInfo.outputPath(`owner-text-${theme}.png`),
        fullPage: true,
      });
    }
    const share = await requestResult(request, {
      path: `/api/share/${conversationId}`,
      token,
      method: 'POST',
      data: {},
    });
    expect(share.ok).toBe(true);
    const shared = await requestResult(request, {
      path: `/api/share/${(share.body as { shareId: string }).shareId}`,
      token,
    });
    expect(shared.ok).toBe(true);
    expect(shared.text).not.toContain('alice@example.com');
    expect(shared.text).not.toContain('privateText');
    expect(shared.text).toContain('EMAIL_1_');

    const unauthorized = await request.post(`/api/messages/${conversationId}/owner-text`, {
      data: { messageIds: [user.messageId] },
    });
    expect(unauthorized.status()).toBe(401);
  } finally {
    await restoreRuntimeFilters(request, token);
    if (conversationId) {
      await requestResult(request, {
        path: '/api/convos',
        token,
        method: 'DELETE',
        data: { arg: { conversationId } },
      });
      await withMongo(async (db) => {
        expect(await db.collection('messages').countDocuments({ conversationId })).toBe(0);
      });
    }
  }
});
