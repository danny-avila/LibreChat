import { expect, test } from '@playwright/test';
import { SESSION_EXPIRY_COOKIE } from 'librechat-data-provider';
import type { Page } from '@playwright/test';
import { clickHouseTheme } from '../../../../packages/client/src/theme/themes/clickhouse';
import { resolveTheme } from '../../../../packages/client/src/theme/registry';

/**
 * `interface.theme` exists only in the `/api/config` answer, so before this
 * change a signed-in reload painted the chat in the default palette until that
 * answer arrived. The reload now replays the last served deployment theme from
 * the inline boot script in `client/index.html` and from `DeploymentTheme`'s
 * cache, so every frame before the answer already wears it.
 *
 * The reload runs throttled (400 ms latency, 1.5 Mbps, 4x CPU) and the config
 * answer is held until the rendered app has painted (the chat layout paints
 * before the config answers; the composer waits for it), so frames of both the
 * loading shell and the app land before it. A fixed hold is not enough: under
 * load the throttled main thread can paint no frame at all for longer than it.
 * Every frame is sampled in a `requestAnimationFrame` callback, which runs
 * before the frame paints.
 */

type Mode = 'light' | 'dark';

type Frame = {
  at: number;
  theme: string | null;
  surface: string;
  shell: string | null;
  /** The bundle has replaced the loading shell with the app. */
  app: boolean;
};

declare global {
  interface Window {
    __themeFrames?: Frame[];
  }
}

const APP_PAINT_TIMEOUT_MS = 45000;
const CACHE_KEY = 'deployment-theme';

/**
 * Serves `theme` as `interface.theme` (`null` removes it), holding the answer until the
 * app has painted while `held()`. Returns when each signed-in answer was sent: that
 * answer is the one carrying the signed-in theme, so the frames before it are the ones
 * under test.
 */
async function serveTheme(page: Page, theme: () => string | null, held: () => boolean) {
  const answeredAt: number[] = [];
  await page.route(
    (url) => url.pathname === '/api/config',
    async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      const served = { ...body.interface };
      delete served.theme;
      const value = theme();
      if (value !== null) {
        served.theme = value;
      }
      if (held()) {
        await page
          .waitForFunction(() => window.__themeFrames?.some((frame) => frame.app), undefined, {
            timeout: APP_PAINT_TIMEOUT_MS,
          })
          .catch(() => undefined);
      }
      if (route.request().headers()['authorization']) {
        answeredAt.push(Date.now());
      }
      await route.fulfill({ response, json: { ...body, interface: served } });
    },
  );
  return answeredAt;
}

/** Records every frame from the first one the document can paint. */
async function sampleFrames(page: Page) {
  await page.addInitScript(() => {
    window.__themeFrames = [];
    const sample = () => {
      if (document.body) {
        const root = document.documentElement;
        const shell = document.getElementById('loading-container');
        window.__themeFrames?.push({
          at: performance.timeOrigin + performance.now(),
          theme: root.getAttribute('data-theme'),
          surface: getComputedStyle(root).getPropertyValue('--surface-primary').trim(),
          shell: shell ? getComputedStyle(shell).backgroundColor : null,
          app: !shell && (document.getElementById('root')?.childElementCount ?? 0) > 0,
        });
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

async function throttle(page: Page) {
  const session = await page.context().newCDPSession(page);
  await session.send('Network.enable');
  await session.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 400,
    downloadThroughput: (1.5 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
}

/**
 * Frames sampled before the signed-in answer, checked to cover both surfaces: the first
 * frame showing content is the loading shell (a frame sampled before `#root` is parsed
 * shows neither), and the app painted too.
 */
async function framesBeforeAnswer(page: Page, answeredAt: number[], reloadedAt: number) {
  await expect.poll(() => answeredAt.some((at) => at > reloadedAt)).toBe(true);
  const answered = Math.min(...answeredAt.filter((at) => at > reloadedAt));
  const frames = (await page.evaluate(() => window.__themeFrames ?? [])).filter(
    (frame) => frame.at < answered,
  );
  expect(frames.find((frame) => frame.shell !== null || frame.app)?.shell).toBeTruthy();
  expect(frames.some((frame) => frame.app)).toBe(true);
  return frames;
}

async function openChat(page: Page) {
  await page.goto('/c/new');
  await expect(page.getByTestId('composer-surface')).toBeVisible({ timeout: 30000 });
}

/** The session expiry the server mirrors in a page-readable cookie, in epoch milliseconds. */
const sessionExpiry = (page: Page) =>
  page.evaluate((name) => {
    const match = new RegExp(`(?:^|;\\s*)${name}=(\\d+)`).exec(document.cookie);
    return match ? Number(match[1]) : null;
  }, SESSION_EXPIRY_COOKIE);

const rgb = (channels?: string) => `rgb(${(channels ?? '').split(' ').join(', ')})`;

/** Reloads throttled with the config held, and checks every frame before the answer. */
async function expectFirstPaint(page: Page, mode: Mode) {
  let held = false;
  const answeredAt = await serveTheme(
    page,
    () => 'clickhouse',
    () => held,
  );
  const { colors } = resolveTheme(clickHouseTheme, mode);

  await openChat(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'clickhouse');
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), CACHE_KEY))
    .not.toBeNull();
  /** The reload happens inside a live session. */
  expect(await sessionExpiry(page)).toBeGreaterThan(Date.now());

  await sampleFrames(page);
  await throttle(page);
  held = true;
  const reloadedAt = Date.now();
  await page.reload();
  await expect(page.getByTestId('composer-surface')).toBeVisible({ timeout: 60000 });
  const frames = await framesBeforeAnswer(page, answeredAt, reloadedAt);

  for (const frame of frames) {
    expect(frame.theme).toBe('clickhouse');
    expect(frame.surface).toBe(colors['rgb-surface-primary']);
    if (frame.shell !== null) {
      expect(frame.shell).toBe(rgb(colors['rgb-surface-canvas']));
    }
  }
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'clickhouse');
  await expect(page.locator('html')).not.toHaveAttribute('data-theme-boot');
}

test.describe('deployment theme first paint (light)', () => {
  test.use({ colorScheme: 'light', viewport: { width: 1280, height: 800 } });

  test('a signed-in reload paints the cached deployment theme from the first frame in light @scenario:deployment-theme-first-paint-light', async ({
    page,
  }) => {
    test.setTimeout(120000);
    await expectFirstPaint(page, 'light');
  });
});

test.describe('deployment theme first paint (dark)', () => {
  test.use({ colorScheme: 'dark', viewport: { width: 1280, height: 800 } });

  test('a signed-in reload paints the cached deployment theme from the first frame in dark @scenario:deployment-theme-first-paint-dark', async ({
    page,
  }) => {
    test.setTimeout(120000);
    await expectFirstPaint(page, 'dark');
  });
});

test('a deployment theme removed since the last visit wins once the config answers @scenario:deployment-theme-removed-wins-over-cache', async ({
  page,
}) => {
  test.setTimeout(90000);
  let theme: string | null = 'clickhouse';
  await serveTheme(
    page,
    () => theme,
    () => false,
  );

  await openChat(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'clickhouse');
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), CACHE_KEY))
    .not.toBeNull();

  theme = null;
  await page.reload();
  await expect(page.getByTestId('composer-surface')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'clickhouse');
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), CACHE_KEY)).toBeNull();
});

/**
 * The session cookies are unreadable before the bundle runs, so the cache is replayed only
 * in a tab that last saw its owner signed in. A cache left by another identity, or a tab
 * with no signed-in owner yet, paints the default shell until the config answers.
 */
async function expectNoCachedPaint(page: Page, open: (page: Page) => Promise<void>) {
  let held = false;
  const answeredAt = await serveTheme(
    page,
    () => 'clickhouse',
    () => held,
  );
  await openChat(page);
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), CACHE_KEY))
    .not.toBeNull();

  await open(page);
  await sampleFrames(page);
  await throttle(page);
  held = true;
  const reloadedAt = Date.now();
  await page.reload();
  await expect(page.getByTestId('composer-surface')).toBeVisible({ timeout: 60000 });
  const frames = await framesBeforeAnswer(page, answeredAt, reloadedAt);
  for (const frame of frames) {
    expect(frame.theme).toBeNull();
  }
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'clickhouse');
  await expect
    .poll(() =>
      page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null')?.owner, CACHE_KEY),
    )
    .not.toBe('tenant-x:someone-else');
}

/** What a browser that last held another identity's theme carries into this tab. */
const cacheForSomeoneElse = (page: Page) =>
  page.evaluate((key) => {
    const entry = JSON.parse(localStorage.getItem(key) ?? 'null');
    localStorage.setItem(key, JSON.stringify({ ...entry, owner: 'tenant-x:someone-else' }));
  }, CACHE_KEY);

/** A fresh tab: the session cookies are shared, the tab's own session storage is not. */
const forgetTabOwner = (page: Page) => page.evaluate(() => sessionStorage.clear());

/**
 * A tab that outlived its session: the owner marker and the cache still match, but the
 * readable session expiry has passed. The refresh token is left valid so the reload can
 * still sign in and the config can answer, which isolates the boot-time check.
 */
const endSession = (page: Page) =>
  page.evaluate((name) => {
    document.cookie = `${name}=${Date.now() - 1000}; path=/`;
  }, SESSION_EXPIRY_COOKIE);

test.describe('cached theme owner (light)', () => {
  test.use({ colorScheme: 'light', viewport: { width: 1280, height: 800 } });

  test('a reload paints no deployment theme cached for another identity in light @scenario:cached-theme-other-owner-not-boot-painted-light', async ({
    page,
  }) => {
    test.setTimeout(120000);
    await expectNoCachedPaint(page, cacheForSomeoneElse);
  });

  test('a tab that has not seen its owner signed in paints no cached deployment theme in light @scenario:cached-theme-unknown-owner-not-boot-painted-light', async ({
    page,
  }) => {
    test.setTimeout(120000);
    await expectNoCachedPaint(page, forgetTabOwner);
  });

  test('a tab whose session has ended paints no cached deployment theme in light @scenario:cached-theme-expired-session-not-boot-painted-light', async ({
    page,
  }) => {
    test.setTimeout(120000);
    await expectNoCachedPaint(page, endSession);
  });
});

test.describe('cached theme owner (dark)', () => {
  test.use({ colorScheme: 'dark', viewport: { width: 1280, height: 800 } });

  test('a reload paints no deployment theme cached for another identity in dark @scenario:cached-theme-other-owner-not-boot-painted-dark', async ({
    page,
  }) => {
    test.setTimeout(120000);
    await expectNoCachedPaint(page, cacheForSomeoneElse);
  });

  test('a tab that has not seen its owner signed in paints no cached deployment theme in dark @scenario:cached-theme-unknown-owner-not-boot-painted-dark', async ({
    page,
  }) => {
    test.setTimeout(120000);
    await expectNoCachedPaint(page, forgetTabOwner);
  });

  test('a tab whose session has ended paints no cached deployment theme in dark @scenario:cached-theme-expired-session-not-boot-painted-dark', async ({
    page,
  }) => {
    test.setTimeout(120000);
    await expectNoCachedPaint(page, endSession);
  });
});

test('a session refresh pushes the readable session expiry forward @scenario:session-refresh-extends-expiry', async ({
  page,
}) => {
  await openChat(page);
  const before = await sessionExpiry(page);
  expect(before).toBeGreaterThan(Date.now());

  const refreshed = await page.evaluate(async () => {
    const response = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
    return response.ok;
  });
  expect(refreshed).toBe(true);
  await expect.poll(() => sessionExpiry(page)).toBeGreaterThan(before ?? 0);
});
