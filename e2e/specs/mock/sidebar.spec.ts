import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/** Width of the virtualized chat list grid vs. its measured container. */
const widths = (page: Page) =>
  page.evaluate(() => {
    const grid = document.querySelector<HTMLElement>('.ReactVirtualized__Grid');
    const wrap = grid?.parentElement ?? null;
    return {
      grid: grid ? grid.getBoundingClientRect().width : -1,
      wrap: wrap ? wrap.getBoundingClientRect().width : -1,
    };
  });

const expectGridTracksContainer = async (page: Page) => {
  await expect
    .poll(
      async () => {
        const { grid, wrap } = await widths(page);
        return wrap > 0 && Math.abs(grid - wrap) <= 1;
      },
      { timeout: 5000 },
    )
    .toBe(true);
};

test.describe('sidebar chat list', () => {
  test('chat list width tracks the sidebar through resize and collapse cycles', async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.goto('/c/new', { timeout: 10000 });
    await expect(page.locator('.ReactVirtualized__Grid').first()).toBeVisible({ timeout: 20000 });
    await expectGridTracksContainer(page);

    const initial = await widths(page);

    const separator = page.locator('[role="separator"][aria-label="Resize sidebar"]');
    const sepBox = await separator.boundingBox();
    expect(sepBox).not.toBeNull();
    const startX = (sepBox?.x ?? 0) + (sepBox?.width ?? 0) / 2;
    const y = (sepBox?.y ?? 0) + (sepBox?.height ?? 0) / 2;

    await page.mouse.move(startX, y);
    await page.mouse.down();
    for (let i = 1; i <= 5; i++) {
      await page.mouse.move(startX + i * 20, y);
      await page.waitForTimeout(50);
    }
    await page.mouse.up();

    await expectGridTracksContainer(page);
    const widened = await widths(page);
    expect(widened.grid).toBeGreaterThan(initial.grid);

    await page.locator('aside').getByTestId('close-sidebar-button').click();
    await page.locator('aside').getByTestId('open-sidebar-button').click();

    await expectGridTracksContainer(page);
    const reopened = await widths(page);
    expect(reopened.grid).toBeGreaterThan(initial.grid);
  });
});
