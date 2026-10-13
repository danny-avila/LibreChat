import { expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';

/**
 * Another app links into this one with its colour mode on the URL
 * (`interface.colorModeFromUrl`, enabled in e2e/config/librechat.e2e.yaml). The
 * shell paints that mode before the first frame, keeps it as the user's own
 * choice and drops the parameter from the address.
 */

type Mode = 'dark' | 'light';

declare global {
  interface Window {
    /** The scheme on `<html>` after every class change since the document started. */
    __modeSamples?: string[];
  }
}

const opposite = (mode: Mode): Mode => (mode === 'dark' ? 'light' : 'dark');

/** A context signed in as the e2e user, with nothing remembered in its storage. */
async function freshProfile(browser: Browser, context: BrowserContext) {
  const { cookies } = await context.storageState();
  return browser.newContext({ storageState: { cookies, origins: [] } });
}

/** Records every scheme `<html>` carries, served with the HTML ahead of the boot script. */
async function recordModes(page: Page) {
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') {
      return route.fallback();
    }
    const response = await route.fetch();
    const recorder = `<script>
  window.__modeSamples = [];
  new MutationObserver(function () {
    var list = document.documentElement.classList;
    window.__modeSamples.push(list.contains('dark') ? 'dark' : list.contains('light') ? 'light' : 'none');
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
</script>`;
    const body = (await response.text()).replace('<head>', `<head>${recorder}`);
    await route.fulfill({ response, body });
  });
}

async function expectSettled(page: Page, mode: Mode) {
  await expect(page.getByTestId('composer-surface')).toBeVisible({ timeout: 30000 });
  const samples = await page.evaluate(() => window.__modeSamples ?? []);
  expect(samples.length).toBeGreaterThan(0);
  expect(samples).not.toContain(opposite(mode));
  expect(samples).not.toContain('none');
  await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${mode}\\b`));
}

const storedMode = (page: Page) => page.evaluate(() => localStorage.getItem('color-theme'));

test.describe('colour-mode handoff', () => {
  for (const mode of ['dark', 'light'] as const) {
    test(`a fresh profile lands in ?theme=${mode} and keeps it @scenario:color-mode-handoff-fresh-${mode}`, async ({
      browser,
      context,
    }) => {
      test.setTimeout(90000);
      const profile = await freshProfile(browser, context);
      const page = await profile.newPage();
      await page.emulateMedia({ colorScheme: opposite(mode) });
      await recordModes(page);
      try {
        await page.goto(`/c/new?theme=${mode}`);
        await expectSettled(page, mode);
        expect(
          await page.evaluate(() =>
            document.documentElement.hasAttribute('data-color-mode-from-url'),
          ),
        ).toBe(true);
        expect(new URL(page.url()).searchParams.has('theme')).toBe(false);
        expect(await storedMode(page)).toBe(mode);

        await page.reload();
        await expectSettled(page, mode);
        expect(await storedMode(page)).toBe(mode);
      } finally {
        await profile.close();
      }
    });

    test(`?theme=${mode} replaces a stored ${opposite(mode)} mode without a flash @scenario:color-mode-handoff-over-stored-${mode}`, async ({
      browser,
      context,
    }) => {
      test.setTimeout(90000);
      const profile = await freshProfile(browser, context);
      const page = await profile.newPage();
      await recordModes(page);
      try {
        await page.goto('/c/new');
        await page.evaluate(
          (stored) => localStorage.setItem('color-theme', stored),
          opposite(mode),
        );
        await page.goto('/c/new');
        await expectSettled(page, opposite(mode));

        await page.goto(`/c/new?theme=${mode}`);
        await expectSettled(page, mode);
        expect(new URL(page.url()).searchParams.has('theme')).toBe(false);
        expect(await storedMode(page)).toBe(mode);

        await page.reload();
        await expectSettled(page, mode);
      } finally {
        await profile.close();
      }
    });
  }

  test('an unsupported value is ignored @scenario:color-mode-handoff-ignores-invalid', async ({
    browser,
    context,
  }) => {
    test.setTimeout(90000);
    const profile = await freshProfile(browser, context);
    const page = await profile.newPage();
    await recordModes(page);
    try {
      await page.goto('/c/new');
      await page.evaluate(() => localStorage.setItem('color-theme', 'light'));

      for (const value of ['purple', 'DARK', 'high-contrast-dark']) {
        await page.goto(`/c/new?theme=${value}`);
        await expectSettled(page, 'light');
        expect(await storedMode(page)).toBe('light');
      }
    } finally {
      await profile.close();
    }
  });
});
