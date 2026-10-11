import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import type { User } from '../../../types';
import {
  MOCK_ENDPOINTS,
  NEW_CHAT_PATH,
  replyPrompt,
  replyText,
  selectMockEndpoint,
  sendMessageAndWaitForCompletion,
} from '../helpers';
import { deleteConversations } from '../db';
import cleanupUser from '../../../setup/cleanupUser';

/**
 * Read-aloud audio is cached in the browser's Cache Storage. Entries are keyed by a
 * SHA-256 hash of the voice and spoken text, so the cache never holds message text,
 * and the whole cache is dropped when the session ends.
 */

test.describe.configure({ timeout: 120_000 });

const TTS_CACHE = 'tts-responses';
const createdConversationIds: string[] = [];

test.afterAll(async () => {
  await deleteConversations(createdConversationIds);
});

/** Stands in for a configured external TTS provider: the e2e config has none. */
async function routeExternalSpeech(page: Page): Promise<{ requests: () => number }> {
  let ttsRequests = 0;
  await page.route('**/api/files/speech/config/get', (route) =>
    route.fulfill({
      json: { textToSpeech: true, engineTTS: 'external', cacheTTS: true, ttsExternal: true },
    }),
  );
  await page.route('**/api/files/speech/tts/voices', (route) => route.fulfill({ json: ['alloy'] }));
  await page.route('**/api/files/speech/tts/manual', (route) => {
    ttsRequests += 1;
    return route.fulfill({
      body: Buffer.from([0xff, 0xf3, 0x00, 0x00]),
      contentType: 'audio/mpeg',
    });
  });
  return { requests: () => ttsRequests };
}

const cacheKeys = (page: Page) =>
  page.evaluate(async (name) => {
    const cache = await caches.open(name);
    return (await cache.keys()).map((request) => new URL(request.url).pathname);
  }, TTS_CACHE);

test.describe('read-aloud audio cache', () => {
  test('replaying a message reads its audio from a cache that holds no message text @scenario:tts-replay-cached-under-hashed-key', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem('engineTTS', JSON.stringify('external'));
      localStorage.setItem('voice', JSON.stringify('alloy'));
    });
    const speech = await routeExternalSpeech(page);

    await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
    /** An entry an earlier version keyed by the raw message text. */
    await page.evaluate(async (name) => {
      await caches.delete(name);
      const cache = await caches.open(name);
      await cache.put(
        '/E2E%20legacy%20reply%20text',
        new Response(new Blob([new Uint8Array([1])])),
      );
    }, TTS_CACHE);
    await selectMockEndpoint(page, MOCK_ENDPOINTS[0]);
    const label = `tts-${randomUUID().slice(0, 8)}`;
    await sendMessageAndWaitForCompletion(page, replyPrompt(label));
    await expect(page.getByText(replyText(label)).first()).toBeVisible({ timeout: 20000 });
    const conversationId = new URL(page.url()).pathname.split('/c/')[1];
    if (conversationId) createdConversationIds.push(conversationId);

    const readAloud = page.getByRole('button', { name: 'Read aloud' }).last();
    await readAloud.click();
    await expect.poll(() => speech.requests()).toBe(1);
    await expect.poll(() => cacheKeys(page)).toHaveLength(1);

    const [key] = await cacheKeys(page);
    expect(key).toMatch(/^\/tts-cache\/[0-9a-f]{64}$/);
    expect(key).not.toContain(encodeURIComponent(label));
    expect(key).not.toContain('E2E');

    await expect(readAloud).toHaveAccessibleName('Read aloud');
    await readAloud.click();
    /** The replay is served from Cache Storage: the provider is not called again. */
    await page.waitForTimeout(1500);
    expect(speech.requests()).toBe(1);
    expect(await cacheKeys(page)).toEqual([key]);
  });

  test('logging out removes cached read-aloud audio @scenario:tts-cache-cleared-on-logout', async ({
    browser,
    baseURL,
  }) => {
    const { context, page, user } = await signInFreshUser(browser, baseURL);
    try {
      await page.evaluate(async (name) => {
        const cache = await caches.open(name);
        await cache.put('/tts-cache/seeded', new Response(new Blob([new Uint8Array([1, 2, 3])])));
      }, TTS_CACHE);
      expect(await hasTTSCache(page)).toBe(true);

      await logOut(page);

      await expect.poll(() => hasTTSCache(page)).toBe(false);
    } finally {
      await context.close().catch(() => undefined);
      await cleanupUser(user);
    }
  });

  test('audio still loading in one tab is not cached after another tab logs out @scenario:tts-cache-stays-cleared-across-tabs', async ({
    browser,
    baseURL,
  }) => {
    const { context, page, user } = await signInFreshUser(browser, baseURL);
    try {
      await page.addInitScript(() => {
        localStorage.setItem('engineTTS', JSON.stringify('external'));
        localStorage.setItem('voice', JSON.stringify('alloy'));
      });
      await context.route('**/api/files/speech/config/get', (route) =>
        route.fulfill({
          json: { textToSpeech: true, engineTTS: 'external', cacheTTS: true, ttsExternal: true },
        }),
      );
      await context.route('**/api/files/speech/tts/voices', (route) =>
        route.fulfill({ json: ['alloy'] }),
      );
      let release: () => void = () => undefined;
      const held = new Promise<void>((resolve) => (release = resolve));
      const requested = new Promise<void>((resolve) => {
        void context.route('**/api/files/speech/tts/manual', async (route) => {
          resolve();
          await held;
          await route.fulfill({
            body: Buffer.from([0xff, 0xf3, 0x00, 0x00]),
            contentType: 'audio/mpeg',
          });
        });
      });

      await page.goto(NEW_CHAT_PATH, { timeout: 10000 });
      await selectMockEndpoint(page, MOCK_ENDPOINTS[0]);
      const label = `tabs-${randomUUID().slice(0, 8)}`;
      await sendMessageAndWaitForCompletion(page, replyPrompt(label));
      await expect(page.getByText(replyText(label)).first()).toBeVisible({ timeout: 20000 });

      await page.getByRole('button', { name: 'Read aloud' }).last().click();
      await requested;

      const other = await context.newPage();
      await other.goto(NEW_CHAT_PATH, { timeout: 10000 });
      await logOut(other);

      const delivered = page.waitForResponse('**/api/files/speech/tts/manual');
      release();
      await delivered;
      /** The first tab would write within a few frames of the response; give it time to. */
      await page.waitForTimeout(1500);
      expect(await hasTTSCache(page)).toBe(false);
    } finally {
      await context.close().catch(() => undefined);
      await cleanupUser(user);
    }
  });
});

const hasTTSCache = (page: Page) => page.evaluate((name) => caches.has(name), TTS_CACHE);

/** A dedicated account, so logging out does not end the session other specs share. */
async function signInFreshUser(
  browser: Browser,
  baseURL: string | undefined,
): Promise<{ context: BrowserContext; page: Page; user: User }> {
  if (typeof baseURL !== 'string') {
    throw new Error('baseURL must be configured for mock scenarios');
  }
  const user: User = {
    name: 'TTS Cache',
    email: `tts-cache-${randomUUID().slice(0, 8)}@example.com`,
    password: `Pw-${randomUUID()}`,
  };
  await cleanupUser(user);
  const context = await browser.newContext({ storageState: undefined, baseURL });
  await context.addInitScript(() => {
    localStorage.setItem('navVisible', 'true');
  });
  const registered = await context.request.post('/api/auth/register', {
    data: {
      email: user.email,
      name: user.name,
      password: user.password,
      confirm_password: user.password,
    },
  });
  expect(registered.ok()).toBeTruthy();

  const page = await context.newPage();
  await page.goto('/login', { timeout: 10000 });
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByTestId('login-button').click();
  await page.waitForURL(/\/c\/new/, { timeout: 10000 });
  return { context, page, user };
}

async function logOut(page: Page): Promise<void> {
  const navUser = page.getByTestId('nav-user');
  if (!(await navUser.isVisible())) {
    await page.getByTestId('header-open-sidebar-button').click();
  }
  await navUser.click();
  await page.getByRole('menuitem', { name: 'Log out' }).click();
  await page.waitForURL(/\/login/, { timeout: 10000 });
}
