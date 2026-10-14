import { expect, test } from '@playwright/test';
import { NEW_CHAT_PATH } from '../helpers';

/**
 * Entering the app lands on chat history whatever panel the user had open last visit, while a
 * reload inside the same tab session keeps the panel the user picked.
 */

test.describe('sidebar panel on entry', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('a returning visit lands on chat history, not the last persisted panel @scenario:entry-lands-on-chat-history', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem('unifiedSidebarExpanded', JSON.stringify(true));
      localStorage.setItem('side:active-panel', 'bookmarks');
    });
    await page.goto(NEW_CHAT_PATH, { timeout: 15000 });

    await expect(page).toHaveURL(/\/c\/new$/);
    await expect(page.getByRole('textbox', { name: 'Message input' })).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByTestId('nav-panel-conversations')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByTestId('nav-panel-bookmarks')).toHaveAttribute('aria-pressed', 'false');
  });

  test('a reload in the same session keeps the chosen panel @scenario:entry-reload-keeps-panel', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem('unifiedSidebarExpanded', JSON.stringify(true));
    });
    await page.goto(NEW_CHAT_PATH, { timeout: 15000 });
    const bookmarks = page.getByTestId('nav-panel-bookmarks');
    await bookmarks.click();
    await expect(bookmarks).toHaveAttribute('aria-pressed', 'true');

    await page.reload();

    await expect(page.getByTestId('nav-panel-bookmarks')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('nav-panel-conversations')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  test('a tab opened from the app lands on chat history even with a cloned session @scenario:entry-opened-tab-lands-on-chat', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem('unifiedSidebarExpanded', JSON.stringify(true));
    });
    await page.goto(NEW_CHAT_PATH, { timeout: 15000 });
    const bookmarks = page.getByTestId('nav-panel-bookmarks');
    await bookmarks.click();
    await expect(bookmarks).toHaveAttribute('aria-pressed', 'true');

    await page.context().addInitScript(() => {
      localStorage.setItem('e2e:cloned-panel', sessionStorage.getItem('side:active-panel') ?? '');
    });
    const [opened] = await Promise.all([
      page.waitForEvent('popup'),
      page.evaluate((path) => {
        window.open(path, '_blank');
      }, NEW_CHAT_PATH),
    ]);

    await expect(opened.getByRole('textbox', { name: 'Message input' })).toBeVisible({
      timeout: 30000,
    });
    expect(await opened.evaluate(() => localStorage.getItem('e2e:cloned-panel'))).toBe('bookmarks');
    await expect(opened.getByTestId('nav-panel-conversations')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(opened.getByTestId('nav-panel-bookmarks')).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    await opened.reload();

    await expect(opened.getByTestId('nav-panel-conversations')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(opened.getByTestId('nav-panel-bookmarks')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});
