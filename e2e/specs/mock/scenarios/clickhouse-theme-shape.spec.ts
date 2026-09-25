import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { NEW_CHAT_PATH } from '../helpers';
import { clickHouseTheme } from '../../../../packages/client/src/theme/themes/clickhouse';
import { probeStyle } from './style.helpers';

/**
 * The ClickHouse theme sets the radius, mono and shadow scales as well as its colours, so the
 * plain `rounded-*`, `font-mono` and `shadow-*` utilities take Click UI's shape. The mention menu
 * carries `rounded-2xl` and `shadow-lg` and opens from the composer, which makes it one real
 * element on both scales. The mode comes from the project, and every expectation is read for the
 * mode the page actually resolved.
 */
test.describe.configure({ timeout: 120_000 });

type Mode = 'light' | 'dark';

const SHADOW_ALPHA: Record<Mode, number> = { light: 0.15, dark: 0.6 };

async function storeClickHouse(page: Page) {
  await page.addInitScript((theme) => {
    localStorage.removeItem('theme-colors');
    localStorage.removeItem('theme-name');
    localStorage.setItem('theme-definition', JSON.stringify(theme));
    localStorage.setItem('theme-source', 'definition');
  }, clickHouseTheme);
}

/** Serves `interface.theme: clickhouse` on `/api/config`, the way librechat.yaml delivers it. */
async function serveClickHouse(page: Page) {
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
}

async function openMentionMenu(page: Page): Promise<Locator> {
  await page.goto(NEW_CHAT_PATH, { timeout: 15000 });
  const composer = page.getByRole('textbox', { name: 'Message input' });
  await expect(composer).toBeVisible({ timeout: 30000 });
  await composer.click();
  await composer.pressSequentially('@');
  const search = page.getByPlaceholder('Mention an endpoint');
  await expect(search).toBeVisible({ timeout: 15000 });
  const menu = page.locator('div.popover').filter({ has: search });
  await expect(menu).toBeVisible();
  return menu;
}

async function resolvedMode(page: Page): Promise<Mode> {
  const dark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  return dark ? 'dark' : 'light';
}

async function expectClickUiShape(page: Page, menu: Locator) {
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'clickhouse');
  const alpha = SHADOW_ALPHA[await resolvedMode(page)];

  /** Click UI's `radii.2`; LibreChat's own `rounded-2xl` is twice that. */
  await expect(menu).toHaveCSS('border-radius', '8px');
  const shadow = await menu.evaluate((node) => getComputedStyle(node).boxShadow);
  expect(shadow).toContain(`rgba(21, 21, 21, ${alpha}) 0px 4px 6px -1px`);
  expect(shadow).toContain(`rgba(21, 21, 21, ${alpha}) 0px 2px 4px -1px`);
}

test.describe('ClickHouse theme shape', () => {
  test('the ClickHouse theme draws the mention menu with Click UI corners and elevation @scenario:clickhouse-theme-reshapes-mention-menu', async ({
    page,
  }) => {
    await storeClickHouse(page);

    const menu = await openMentionMenu(page);

    await expectClickUiShape(page, menu);
  });

  test('interface.theme clickhouse reshapes the mention menu without a stored theme @scenario:clickhouse-deployment-theme-reshapes-mention-menu', async ({
    page,
  }) => {
    await serveClickHouse(page);

    const menu = await openMentionMenu(page);

    await expectClickUiShape(page, menu);
    expect(await page.evaluate(() => localStorage.getItem('theme-definition'))).toBeNull();
  });

  test('theme controls take Click UI control height, checked fill and focus outline @scenario:clickhouse-controls-follow-click-ui', async ({
    page,
  }) => {
    await storeClickHouse(page);

    await openMentionMenu(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'clickhouse');
    const mode = await resolvedMode(page);

    /** `genericMenu.panel.size.height` and `transition.default`; the shared spacing role that
     *  also pads message bubbles keeps LibreChat's 12px. */
    expect(await probeStyle(page, 'h-theme-control', 'height')).toBe('32px');
    expect(await probeStyle(page, 'px-theme-normal', 'padding-left')).toBe('12px');
    expect(await probeStyle(page, 'duration-theme-fast', 'transition-duration')).toBe('0.1s');
    /** The checked checkbox and switch fill, and `outline.default`. */
    const fill = mode === 'light' ? 'rgb(21, 21, 21)' : 'rgb(250, 255, 105)';
    const ring = mode === 'light' ? 'rgb(67, 126, 239)' : 'rgb(250, 255, 105)';
    expect(await probeStyle(page, 'bg-surface-inverted', 'background-color')).toBe(fill);
    expect(await probeStyle(page, 'ring-2 ring-ring-primary', 'box-shadow')).toContain(ring);
  });

  test('monospace text under the ClickHouse theme leads with Inconsolata @scenario:clickhouse-mono-font-leads-with-inconsolata', async ({
    page,
  }) => {
    await storeClickHouse(page);

    await openMentionMenu(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'clickhouse');

    const family = await probeStyle(page, 'font-mono', 'font-family');
    expect(family.replace(/"/g, '').startsWith('Inconsolata')).toBe(true);
    expect(family).toContain('monospace');
  });
});
