import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { clickHouseTheme } from '../../../../packages/client/src/theme/themes/clickhouse';
import { getE2EUser } from '../../../setup/user';
import { themeValue } from './style.helpers';

/**
 * `interface.theme` in librechat.yaml reaches the client through `/api/config`,
 * both before sign-in and after it. The scenario serves `clickhouse` there and
 * nothing through storage, so the theme can only come from the config, and it
 * checks the login page already paints it instead of switching after sign-in.
 */

type Mode = 'light' | 'dark';

const MODES: Mode[] = ['light', 'dark'];

test.use({ viewport: { width: 1280, height: 800 } });

async function openSignedOut(browser: Browser, baseURL: string, mode: Mode) {
  const context = await browser.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
    colorScheme: mode,
  });
  const page = await context.newPage();
  await page.addInitScript((colorTheme) => {
    localStorage.setItem('color-theme', colorTheme);
  }, mode);
  await page.route(
    (url) => url.pathname === '/api/config',
    async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      await route.fulfill({
        response,
        json: { ...body, interface: { ...body.interface, theme: 'clickhouse' } },
      });
    },
  );
  return { context, page };
}

async function expectClickHouse(page: Page, mode: Mode) {
  const colors = clickHouseTheme.modes[mode]?.colors ?? {};
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'clickhouse');
  await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${mode}\\b`));
  expect(await themeValue(page, '--surface-primary')).toBe(colors['rgb-surface-primary']);
  expect(await themeValue(page, '--theme-control-radius')).toBe('0.25rem');
  const stored = await page.evaluate(() => localStorage.getItem('theme-definition'));
  expect(stored).toBeNull();
}

async function capture(page: Page, name: string) {
  await test.info().attach(name, { body: await page.screenshot(), contentType: 'image/png' });
}

test.describe('deployment theme from librechat.yaml', () => {
  for (const mode of MODES) {
    test(`interface.theme paints the login page and the chat in ${mode} mode @scenario:deployment-theme-from-config-${mode}`, async ({
      browser,
      baseURL,
    }) => {
      test.setTimeout(90000);
      if (typeof baseURL !== 'string') {
        throw new Error('baseURL must be configured for the deployment theme scenario');
      }
      const user = getE2EUser();
      const { context, page } = await openSignedOut(browser, baseURL, mode);

      try {
        await page.goto('/login');
        await expect(page.getByTestId('login-button')).toBeVisible({ timeout: 20000 });
        await expectClickHouse(page, mode);
        await capture(page, `login-${mode}`);

        await page.getByLabel('Email').fill(user.email);
        await page.getByLabel('Password').fill(user.password);
        await page.getByTestId('login-button').click();
        await page.waitForURL(/\/c\/new/, { timeout: 20000 });
        await expect(page.getByTestId('nav-user')).toBeVisible({ timeout: 20000 });
        await expectClickHouse(page, mode);
        await capture(page, `chat-${mode}`);
      } finally {
        await context.close();
      }
    });
  }
});
