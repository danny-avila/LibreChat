import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/** Size of the virtualized chat list grid vs. its measured container. */
const sizes = (page: Page) =>
  page.evaluate(() => {
    const grid = document.querySelector<HTMLElement>('aside .ReactVirtualized__Grid');
    const wrap = grid?.parentElement ?? null;
    const gridRect = grid?.getBoundingClientRect();
    const wrapRect = wrap?.getBoundingClientRect();
    return {
      grid: gridRect ? gridRect.width : -1,
      wrap: wrapRect ? wrapRect.width : -1,
      gridH: gridRect ? gridRect.height : -1,
      wrapH: wrapRect ? wrapRect.height : -1,
    };
  });

const expectGridTracksContainer = async (page: Page) => {
  await expect
    .poll(
      async () => {
        const { grid, wrap, gridH, wrapH } = await sizes(page);
        return wrap > 0 && Math.abs(grid - wrap) <= 1 && wrapH > 0 && Math.abs(gridH - wrapH) <= 1;
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
    await expect(page.locator('aside .ReactVirtualized__Grid').first()).toBeVisible({
      timeout: 20000,
    });
    await expectGridTracksContainer(page);

    const initial = await sizes(page);

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
    const widened = await sizes(page);
    expect(widened.grid).toBeGreaterThan(initial.grid);

    await page.locator('aside').getByTestId('close-sidebar-button').click();
    await page.locator('aside').getByTestId('open-sidebar-button').click();

    await expectGridTracksContainer(page);
    const reopened = await sizes(page);
    expect(reopened.grid).toBeGreaterThan(initial.grid);

    await page.setViewportSize({ width: 1280, height: 540 });
    await expectGridTracksContainer(page);
    const shrunken = await sizes(page);
    expect(shrunken.gridH).toBeLessThan(reopened.gridH);
  });
});
