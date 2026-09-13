import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { getE2EUser } from '../../../setup/user';
import {
  deleteConversations,
  deleteMessagesByConversation,
  seedConversations,
  seedMessages,
  withMongo,
} from '../db';
import {
  getAccessToken,
  MOCK_ENDPOINTS,
  NEW_CHAT_PATH,
  requestJson,
  selectMockEndpoint,
  sendMessageAndWaitForCompletion,
} from '../helpers';
import { openConversationMenu, openSidebar } from './sidebar';

const userEmail = getE2EUser().email;
const now = () => new Date();

function conversationId() {
  return randomUUID();
}

async function seedConversation(
  id: string,
  title: string,
  fields: { lastResponseAt?: Date; lastSeenAt?: Date; lastResponseIsManual?: boolean } = {},
) {
  const updatedAt = fields.lastResponseAt ?? fields.lastSeenAt ?? now();
  await seedConversations(userEmail, [{ conversationId: id, title, updatedAt }]);
  await withMongo(async (db) => {
    const user = await db.collection('users').findOne({ email: userEmail });
    if (!user) throw new Error(`E2E user ${userEmail} does not exist`);
    const $set: Record<string, unknown> = {};
    const $unset: Record<string, ''> = {};
    if (fields.lastResponseAt) $set.lastResponseAt = fields.lastResponseAt;
    else $unset.lastResponseAt = '';
    if (fields.lastSeenAt) $set.lastSeenAt = fields.lastSeenAt;
    else $unset.lastSeenAt = '';
    if (fields.lastResponseIsManual !== undefined)
      $set.lastResponseIsManual = fields.lastResponseIsManual;
    await db.collection('conversations').updateOne(
      { user: user._id.toString(), conversationId: id },
      {
        ...(Object.keys($set).length ? { $set } : {}),
        ...(Object.keys($unset).length ? { $unset } : {}),
      },
    );
  });
}

async function readConversation(id: string) {
  return withMongo(async (db) => {
    const user = await db.collection('users').findOne({ email: userEmail });
    if (!user) throw new Error(`E2E user ${userEmail} does not exist`);
    return db
      .collection('conversations')
      .findOne({ user: user._id.toString(), conversationId: id });
  });
}
async function restoreUnreadBaseline(id: string, lastResponseAt: Date, lastSeenAt: Date) {
  await withMongo(async (db) => {
    const user = await db.collection('users').findOne({ email: userEmail });
    if (!user) throw new Error(`E2E user ${userEmail} does not exist`);
    await db
      .collection('conversations')
      .updateOne(
        { user: user._id.toString(), conversationId: id },
        { $set: { lastResponseAt, lastSeenAt } },
      );
  });
}

async function cleanup(id: string) {
  await deleteMessagesByConversation([id]);
  await deleteConversations([id]);
}

async function enableUnseenBadge(page: Page) {
  await page.addInitScript(() => localStorage.setItem('unseenTabBadge', 'true'));
}

async function unfocus(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(document, 'hasFocus', {
      configurable: true,
      value: () => false,
    });
    window.dispatchEvent(new Event('blur'));
  });
}

async function seedReplyMessage(id: string, label: string) {
  const userMessageId = randomUUID();
  await seedMessages(userEmail, id, [
    {
      messageId: userMessageId,
      parentMessageId: '00000000-0000-0000-0000-000000000000',
      text: `Earlier prompt ${label}`,
      isCreatedByUser: true,
      sender: 'User',
    },
    {
      messageId: randomUUID(),
      parentMessageId: userMessageId,
      text: `Earlier reply ${label}`,
      isCreatedByUser: false,
      sender: 'OpenAI',
    },
  ]);
}

test.describe('unseen replies', () => {
  test('opening a conversation clears its dot and the title count @scenario:open-conversation-clears-dot-and-title-count', async ({
    page,
  }) => {
    const first = conversationId();
    const second = conversationId();
    const firstTitle = `Unseen first ${first.slice(0, 8)}`;
    const secondTitle = `Unseen second ${second.slice(0, 8)}`;
    const replyAt = new Date(Date.now() - 2_000);
    const seenAt = new Date(replyAt.getTime() - 1_000);
    try {
      await seedConversation(first, firstTitle, { lastResponseAt: replyAt, lastSeenAt: seenAt });
      await seedConversation(second, secondTitle, { lastResponseAt: replyAt, lastSeenAt: seenAt });
      await seedReplyMessage(first, firstTitle);
      await enableUnseenBadge(page);
      await page.goto(NEW_CHAT_PATH);
      await openSidebar(page);
      await expect(page.getByTestId('convo-item').filter({ hasText: firstTitle })).toBeVisible();
      await expect(
        page
          .getByTestId('convo-item')
          .filter({ hasText: firstTitle })
          .locator('span[aria-hidden="true"].bg-status-info'),
      ).toBeVisible();
      await expect.poll(() => page.title()).toMatch(/^\(2\)/);
      await page
        .getByTestId('convo-item')
        .filter({ hasText: firstTitle })
        .getByRole('button', { name: new RegExp(`^${firstTitle} conversation`) })
        .dispatchEvent('click');
      await expect(page).toHaveURL(new RegExp(`/c/${first}$`));
      await expect(
        page.getByTestId('messages-view').getByText(`Earlier reply ${firstTitle}`),
      ).toBeVisible();
      await expect(
        page
          .getByTestId('convo-item')
          .filter({ hasText: firstTitle })
          .locator('span[aria-hidden="true"].bg-status-info'),
      ).toHaveCount(0);
      await expect.poll(() => page.title()).toMatch(/^\(1\)/);
    } finally {
      await cleanup(first);
      await cleanup(second);
    }
  });

  test('marking a read conversation unread restores its dot and title count @scenario:mark-as-unread-restores-dot', async ({
    page,
  }) => {
    const id = conversationId();
    const title = `Mark unread ${id.slice(0, 8)}`;
    const replyAt = new Date(Date.now() - 2_000);
    try {
      await seedConversation(id, title, { lastResponseAt: replyAt, lastSeenAt: replyAt });
      await seedReplyMessage(id, title);
      await enableUnseenBadge(page);
      await page.goto(NEW_CHAT_PATH);
      await openSidebar(page);
      const row = page.getByTestId('convo-item').filter({ hasText: title });
      await expect(row.locator('span[aria-hidden="true"].bg-status-info')).toHaveCount(0);
      await openConversationMenu(row);
      await page.getByRole('menuitem', { name: 'Mark as unread' }).click();
      await expect(row.locator('span[aria-hidden="true"].bg-status-info')).toBeVisible();
      await expect.poll(() => page.title()).toMatch(/^\(1\)/);

      const token = await getAccessToken(page);
      const neverReplied = conversationId();
      try {
        await seedConversation(neverReplied, `Never replied ${neverReplied.slice(0, 8)}`);
        const response = await requestJson<{
          modified: boolean;
          lastResponseAt?: string;
          lastResponseIsManual?: boolean;
        }>(page, {
          path: '/api/convos/unread',
          token,
          method: 'POST',
          body: { arg: { conversationId: neverReplied } },
        });
        expect(response.modified).toBe(true);
        expect(response.lastResponseAt).toBeTruthy();
        expect(response.lastResponseIsManual).toBe(true);
        const stored = await readConversation(neverReplied);
        expect(stored?.lastResponseIsManual).toBe(true);
        expect(stored?.lastResponseAt).toBeInstanceOf(Date);
      } finally {
        await cleanup(neverReplied);
      }
    } finally {
      await cleanup(id);
    }
  });

  test('conversation accessible name announces unread reply with the dot @scenario:accessible-name-announces-unread', async ({
    page,
  }) => {
    const id = conversationId();
    const title = `Accessible unread ${id.slice(0, 8)}`;
    const replyAt = new Date(Date.now() - 2_000);
    try {
      await seedConversation(id, title, { lastResponseAt: replyAt, lastSeenAt: replyAt });
      await seedReplyMessage(id, title);
      await page.goto(NEW_CHAT_PATH);
      await openSidebar(page);
      const row = page.getByTestId('convo-item').filter({ hasText: title });
      const button = row.getByRole('button').first();
      await expect(button).toHaveAccessibleName(`${title} conversation`);
      await openConversationMenu(row);
      await page.getByRole('menuitem', { name: 'Mark as unread' }).click();
      await expect(button).toHaveAccessibleName(`${title} conversation, Unread`);
      await expect(row.locator('span[aria-hidden="true"].bg-status-info')).toBeVisible();
    } finally {
      await cleanup(id);
    }
  });

  test('a reply completing in another tab lights the first tab without reload @scenario:reply-finishing-in-another-tab-lights-dot', async ({
    page,
    context,
  }) => {
    /* Setup on the mobile project (drawer, endpoint picker, streamed reply) plus a full
       30-second away-poll interval and its list refresh can exceed 90 seconds. */
    test.setTimeout(150_000);
    const id = conversationId();
    const title = `Other tab reply ${id.slice(0, 8)}`;
    const replyAt = new Date(Date.now() - 2_000);
    try {
      await seedConversation(id, title, { lastResponseAt: replyAt, lastSeenAt: replyAt });
      await seedReplyMessage(id, title);
      await enableUnseenBadge(page);
      await page.goto(NEW_CHAT_PATH);
      await openSidebar(page);
      const row = page.getByTestId('convo-item').filter({ hasText: title });
      await expect(row.locator('span[aria-hidden="true"].bg-status-info')).toHaveCount(0);
      await unfocus(page);

      const second = await context.newPage();
      try {
        await second.goto(`/c/${id}`);
        await openSidebar(second);
        await expect(second.getByRole('textbox', { name: 'Message input' })).toBeVisible();
        await selectMockEndpoint(second, MOCK_ENDPOINTS[0]);
        await second.bringToFront();
        await unfocus(page);
        await sendMessageAndWaitForCompletion(second, `E2E_REPLY:other-tab-${id.slice(0, 8)}`);
        /* Back to the front, still away: a backgrounded tab has its timers throttled, so the
         * 30-second away poll this scenario is about may simply never run inside the budget.
         * `unfocus` keeps the app in away mode while the browser keeps the page live. */
        await page.bringToFront();
        await unfocus(page);
        /* The reply tab also marks its active conversation read; restore the remote tab's
         * unread baseline so the first tab observes the new response stamp. */
        await restoreUnreadBaseline(id, now(), replyAt);
        await expect(row.locator('span[aria-hidden="true"].bg-status-info')).toBeVisible({
          timeout: 75_000,
        });
        await expect.poll(() => page.title()).toMatch(/^\(1\)/);
      } finally {
        await second.close();
      }
    } finally {
      await cleanup(id);
    }
  });

  test('notification permission is requested from the toggle click, not load @scenario:notification-permission-from-toggle-click', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const calls: string[] = [];
      class TestNotification {
        static permission = 'default';
        static requestPermission() {
          calls.push('request');
          TestNotification.permission = 'granted';
          return Promise.resolve('granted');
        }
      }
      Object.defineProperty(window, 'Notification', {
        configurable: true,
        value: TestNotification,
      });
      Object.defineProperty(window, '__notificationPermissionCalls', {
        configurable: true,
        value: calls,
      });
    });
    await page.goto(NEW_CHAT_PATH);
    await openSidebar(page);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as Window & { __notificationPermissionCalls: string[] })
              .__notificationPermissionCalls,
        ),
      )
      .toEqual([]);
    await page.getByTestId('nav-user').dispatchEvent('click');
    await page.getByTestId('nav-settings').dispatchEvent('click');
    await page.getByRole('tab', { name: 'General' }).dispatchEvent('click');
    const toggle = page.getByTestId('replyNotifications');
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as Window & { __notificationPermissionCalls: string[] })
              .__notificationPermissionCalls,
        ),
      )
      .toEqual(['request']);
  });

  test('replies withheld by a pending permission prompt are released once with one notification @scenario:withheld-replies-released-after-grant', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    const id = conversationId();
    const title = `Withheld reply ${id.slice(0, 8)}`;
    const replyAt = new Date(Date.now() - 2_000);
    await page.addInitScript(() => {
      const constructions: string[] = [];
      const calls: string[] = [];
      let resolvePermission: ((permission: NotificationPermission) => void) | undefined;
      const pending = new Promise<NotificationPermission>((resolve) => {
        resolvePermission = resolve;
      });
      class TestNotification {
        static permission: NotificationPermission = 'default';
        static requestPermission() {
          calls.push('request');
          return pending;
        }
        close() {}
        onclick: (() => void) | null = null;
        constructor() {
          constructions.push('notification');
        }
      }
      Object.defineProperty(window, 'Notification', {
        configurable: true,
        value: TestNotification,
      });
      Object.defineProperty(window, '__notificationPermissionCalls', {
        configurable: true,
        value: calls,
      });
      Object.defineProperty(window, '__notificationConstructions', {
        configurable: true,
        value: constructions,
      });
      Object.defineProperty(window, '__grantNotificationPermission', {
        configurable: true,
        value: () => {
          TestNotification.permission = 'granted';
          resolvePermission?.('granted');
        },
      });
    });
    try {
      await seedConversation(id, title, { lastResponseAt: replyAt, lastSeenAt: replyAt });
      await seedReplyMessage(id, title);
      await page.goto(NEW_CHAT_PATH);
      await openSidebar(page);
      await page.getByTestId('nav-user').dispatchEvent('click');
      await page.getByTestId('nav-settings').dispatchEvent('click');
      await page.getByRole('tab', { name: 'General' }).dispatchEvent('click');
      const toggle = page.getByTestId('replyNotifications');
      await expect(toggle).toBeVisible();
      await toggle.click();
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (window as Window & { __notificationPermissionCalls: string[] })
                .__notificationPermissionCalls,
          ),
        )
        .toEqual(['request']);

      /* Stay on this page: a reload would re-run the init script with a fresh pending
         promise that the hook never requested, and the grant below would resolve nothing. */
      await page.keyboard.press('Escape');
      await expect(toggle).toBeHidden();
      await openSidebar(page);
      await unfocus(page);
      const row = page.getByTestId('convo-item').filter({ hasText: title });
      const second = await context.newPage();
      try {
        await second.goto(`/c/${id}`);
        await openSidebar(second);
        await expect(second.getByRole('textbox', { name: 'Message input' })).toBeVisible();
        await selectMockEndpoint(second, MOCK_ENDPOINTS[0]);
        await second.bringToFront();
        await unfocus(page);
        await sendMessageAndWaitForCompletion(second, `E2E_REPLY:withheld-${id.slice(0, 8)}`);
        await restoreUnreadBaseline(id, now(), replyAt);
      } finally {
        await second.evaluate(() => window.dispatchEvent(new Event('blur'))).catch(() => {});
        await second.close();
      }
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (window as Window & { __notificationConstructions: string[] })
                .__notificationConstructions,
          ),
        )
        .toEqual([]);

      await page.evaluate(() => {
        (
          window as Window & { __grantNotificationPermission: () => void }
        ).__grantNotificationPermission();
      });
      await restoreUnreadBaseline(id, now(), replyAt);
      await expect(row.locator('span[aria-hidden="true"].bg-status-info')).toBeVisible({
        timeout: 45_000,
      });
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (window as Window & { __notificationConstructions: string[] })
                .__notificationConstructions,
          ),
        )
        .toEqual(['notification']);
    } finally {
      await cleanup(id);
    }
  });

  test('concurrent reply stamps remain monotonic under an older wall clock @scenario:clock-skewed-concurrent-stamps', async ({
    context,
  }) => {
    const id = conversationId();
    const title = `Clock skew ${id.slice(0, 8)}`;
    const baseline = new Date(Date.now() - 10_000);
    const observations: number[] = [baseline.getTime()];
    try {
      await seedConversation(id, title, { lastResponseAt: baseline, lastSeenAt: baseline });
      await seedReplyMessage(id, title);
      const pages = await Promise.all([context.newPage(), context.newPage(), context.newPage()]);
      try {
        for (const [index, otherPage] of pages.entries()) {
          await otherPage.goto(`/c/${id}`);
          await openSidebar(otherPage);
          await expect(otherPage.getByRole('textbox', { name: 'Message input' })).toBeVisible();
          await selectMockEndpoint(otherPage, MOCK_ENDPOINTS[0]);
          await sendMessageAndWaitForCompletion(
            otherPage,
            `E2E_REPLY:clock-${index}-${id.slice(0, 8)}`,
          );
          const observed = await readConversation(id);
          if (observed?.lastResponseAt) observations.push(observed.lastResponseAt.getTime());
        }
      } finally {
        await Promise.all(pages.map((otherPage) => otherPage.close()));
      }
      const stored = await readConversation(id);
      expect(stored?.lastResponseAt).toBeInstanceOf(Date);
      const finalStamp = (stored?.lastResponseAt as Date).getTime();
      expect(finalStamp).toBe(Math.max(...observations));
    } finally {
      await cleanup(id);
    }
  });

  test('a stale seen acknowledgement is rejected without regressing read state or updatedAt @scenario:stale-seen-ack-rejected', async ({
    page,
  }) => {
    const id = conversationId();
    const title = `Stale seen ${id.slice(0, 8)}`;
    const oldReplyAt = new Date(Date.now() - 4_000);
    const newReplyAt = new Date(Date.now() - 2_000);
    const seenAt = new Date(Date.now() - 3_000);
    const updatedAt = new Date(Date.now() - 1_000);
    try {
      await seedConversation(id, title, { lastResponseAt: newReplyAt, lastSeenAt: seenAt });
      await withMongo(async (db) => {
        const user = await db.collection('users').findOne({ email: userEmail });
        if (!user) throw new Error(`E2E user ${userEmail} does not exist`);
        await db
          .collection('conversations')
          .updateOne({ user: user._id.toString(), conversationId: id }, { $set: { updatedAt } });
      });
      await page.goto(NEW_CHAT_PATH);
      const token = await getAccessToken(page);
      const response = await requestJson<{ modified: boolean }>(page, {
        path: '/api/convos/seen',
        token,
        method: 'POST',
        body: { arg: { conversationId: id, lastResponseAt: oldReplyAt.toISOString() } },
      });
      expect(response.modified).toBe(false);
      const stored = await readConversation(id);
      expect(stored?.lastResponseAt?.getTime()).toBe(newReplyAt.getTime());
      expect(stored?.lastSeenAt?.getTime()).toBe(seenAt.getTime());
      expect(stored?.updatedAt?.getTime()).toBe(updatedAt.getTime());
    } finally {
      await cleanup(id);
    }
  });

  test('metadata edits preserve a manual unread flag and a real reply clears it @scenario:metadata-edit-preserves-manual-unread', async ({
    page,
  }) => {
    const id = conversationId();
    const title = `Manual unread ${id.slice(0, 8)}`;
    const renamed = `${title} renamed`;
    try {
      await seedConversation(id, title);
      await page.goto(NEW_CHAT_PATH);
      const token = await getAccessToken(page);
      const unread = await requestJson<{ modified: boolean; lastResponseIsManual?: boolean }>(
        page,
        {
          path: '/api/convos/unread',
          token,
          method: 'POST',
          body: { arg: { conversationId: id } },
        },
      );
      expect(unread.modified).toBe(true);
      expect(unread.lastResponseIsManual).toBe(true);
      await requestJson(page, {
        path: '/api/convos/update',
        token,
        method: 'POST',
        body: { arg: { conversationId: id, title: renamed } },
      });
      let stored = await readConversation(id);
      expect(stored?.title).toBe(renamed);
      expect(stored?.lastResponseIsManual).toBe(true);

      await page.goto(`/c/${id}`);
      await expect(page.getByRole('textbox', { name: 'Message input' })).toBeVisible();
      await selectMockEndpoint(page, MOCK_ENDPOINTS[0]);
      await sendMessageAndWaitForCompletion(page, `E2E_REPLY:clears-manual-${id.slice(0, 8)}`);
      stored = await readConversation(id);
      expect(stored?.lastResponseIsManual).toBeUndefined();
    } finally {
      await cleanup(id);
    }
  });

  test('applying a preset does not fabricate or clear conversation read-state fields @scenario:preset-apply-cannot-fabricate-unread', async ({
    page,
  }) => {
    const id = conversationId();
    const title = `Preset read state ${id.slice(0, 8)}`;
    const replyAt = new Date(Date.now() - 4_000);
    const seenAt = new Date(Date.now() - 3_000);
    try {
      await seedConversation(id, title, {
        lastResponseAt: replyAt,
        lastSeenAt: seenAt,
        lastResponseIsManual: true,
      });
      const before = await readConversation(id);
      await page.goto(NEW_CHAT_PATH);
      const token = await getAccessToken(page);
      await requestJson(page, {
        path: '/api/convos/update',
        token,
        method: 'POST',
        body: {
          arg: {
            conversationId: id,
            title,
            endpoint: MOCK_ENDPOINTS[0].model,
            model: MOCK_ENDPOINTS[0].model,
            modelLabel: 'Preset applied',
          },
        },
      });
      const after = await readConversation(id);
      expect(after?.lastResponseAt?.toISOString()).toBe(before?.lastResponseAt?.toISOString());
      expect(after?.lastSeenAt?.toISOString()).toBe(before?.lastSeenAt?.toISOString());
      expect(after?.lastResponseIsManual).toBe(before?.lastResponseIsManual);
    } finally {
      await cleanup(id);
    }
  });

  test('aborting an empty generation does not stamp lastResponseAt @scenario:abort-null-save-does-not-stamp', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const id = conversationId();
    const title = `Abort empty ${id.slice(0, 8)}`;
    const replyAt = new Date(Date.now() - 2_000);
    try {
      await seedConversation(id, title, { lastResponseAt: replyAt, lastSeenAt: replyAt });
      await seedReplyMessage(id, title);
      await page.goto(`/c/${id}`);
      await expect(page.getByRole('textbox', { name: 'Message input' })).toBeVisible();
      await selectMockEndpoint(page, MOCK_ENDPOINTS[0]);
      const input = page.getByRole('textbox', { name: 'Message input' });
      await input.fill(`E2E_EMPTY_SLOW_REPLY:${id.slice(0, 8)}`);
      await input.press('Enter');
      const stop = page.getByRole('button', { name: 'Stop generating' });
      await expect(stop).toBeVisible({ timeout: 15_000 });
      await stop.click();
      await expect(stop).toBeHidden({ timeout: 30_000 });
      await expect
        .poll(async () => (await readConversation(id))?.lastResponseAt?.getTime())
        .toBe(replyAt.getTime());
    } finally {
      await cleanup(id);
    }
  });
});
