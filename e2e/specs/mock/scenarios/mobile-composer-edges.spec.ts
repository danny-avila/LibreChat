import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Below `sm` the composer is full-bleed: squared off at the bottom and flush
 * with the screen. It was inset on two sides anyway — it reserved the message
 * column's scrollbar band on its trailing edge, and carried a band of padding
 * under its action row — so the surface stopped short of both edges.
 */

const COMPOSER = '[data-testid="composer-surface"]';

test.describe('mobile composer', () => {
  test('the composer reaches the screen edges @scenario:mobile-composer-reaches-screen-edges', async ({
    page,
  }) => {
    const width = page.viewportSize()?.width ?? 0;
    test.skip(width >= 640, 'the composer is a centred card from the sm breakpoint up');

    await page.goto('/c/new', { timeout: 10000 });
    await expect(page.locator(COMPOSER)).toBeVisible();

    const edges = await measureEdges(page);
    expect(edges.left).toBeCloseTo(0, 0);
    expect(edges.right).toBeCloseTo(edges.viewportWidth, 0);
    /** The action row is the last thing in the surface: no empty band under it. */
    expect(edges.surfaceBottom - edges.actionRowBottom).toBeLessThanOrEqual(2);
    expect(edges.viewportHeight - edges.surfaceBottom).toBeLessThanOrEqual(2);
  });
});

async function measureEdges(page: Page) {
  return page.evaluate((selector) => {
    const surface = document.querySelector(selector);
    if (!surface) {
      throw new Error(`${selector} is not rendered`);
    }
    const actionRow = surface.lastElementChild;
    if (!actionRow) {
      throw new Error('the composer surface has no action row');
    }
    const surfaceRect = surface.getBoundingClientRect();
    return {
      left: Math.round(surfaceRect.left),
      right: Math.round(surfaceRect.right),
      surfaceBottom: Math.round(surfaceRect.bottom),
      actionRowBottom: Math.round(actionRow.getBoundingClientRect().bottom),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  }, COMPOSER);
}
