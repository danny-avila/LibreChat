import { expect, test } from '@playwright/test';

/**
 * The unmounted Files component tree this change deleted was never reachable,
 * which is exactly why its removal needs a scenario: the surfaces that LOOK
 * like it, the chat input's file manager and the files side panel, are the ones
 * a bad deletion would take with them.
 */

test.describe('files surfaces after the tree removal', () => {
  test('the files panel and the composer attachment entry still work @scenario:files-tree-removal-leaves-live-surfaces-working', async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.goto('/c/new', { timeout: 15000 });

    await page.getByTestId('nav-panel-files').click();
    const panel = page.getByRole('region', { name: 'Files Table' });
    await expect(panel).toBeVisible({ timeout: 15000 });
    /** The panel's own filter field is part of the live tree that had to
     *  survive the deletion of the unreachable one beside it. */
    await expect(panel.locator('#filename-filter')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('composer-surface')).toBeVisible();
  });
});
