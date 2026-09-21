import { expect, test } from '@playwright/test';
import { NEW_CHAT_PATH } from './helpers';

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
]) {
  test(`startup frame preserves a stored selection while agents load at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(NEW_CHAT_PATH);
    await expect(page.getByRole('button', { name: 'Select a model' }).first()).toBeVisible();

    const storedSelection = JSON.stringify({ endpoint: 'agents', agent_id: 'agent_missing' });
    await page.evaluate((selection) => {
      localStorage.setItem('LAST_CONVO_SETUP_0', selection);
    }, storedSelection);

    let releaseCatalog!: () => void;
    const catalogReady = new Promise<void>((resolve) => {
      releaseCatalog = resolve;
    });
    await page.route('**/api/agents?*', async (route) => {
      await catalogReady;
      await route.fulfill({
        json: { object: 'list', data: [], has_more: false, after: null },
      });
    });

    try {
      await page.reload({ waitUntil: 'domcontentloaded' });
      const frame = page.getByRole('main');
      await expect(frame.getByRole('status')).toHaveText('Loading...');
      await expect(frame.getByRole('button', { name: 'Select a model' })).toHaveCount(0);
      await expect(frame.getByRole('textbox')).toHaveCount(0);
      expect(await page.evaluate(() => localStorage.getItem('LAST_CONVO_SETUP_0'))).toBe(
        storedSelection,
      );
      if (viewport.width < 768) {
        await expect(page.getByTestId('header-open-sidebar-button')).toBeVisible();
      }

      releaseCatalog();
      await expect(page.getByRole('button', { name: 'Select a model' }).first()).toContainText(
        'E2E Soft Default',
      );
      await expect(page.getByRole('main').getByRole('status')).toHaveCount(0);
    } finally {
      releaseCatalog();
    }
  });
}
