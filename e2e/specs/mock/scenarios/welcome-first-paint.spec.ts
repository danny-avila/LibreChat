import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * The welcome screen holds back the band the message column reserves for its
 * scrollbar, and it has to know that band's width by the first frame it paints.
 * Measuring it after paint publishes the real value late and recentres the
 * greeting and composer by half the band — the shift this reservation exists to
 * remove, moved from navigation to load.
 *
 * The band only differs from the token on a platform whose scrollbars reserve
 * nothing, so that platform is what this serves.
 */

const COMPOSER = '[data-testid="composer-surface"]';

declare global {
  interface Window {
    /** Every composer x position painted since the document started. */
    __composerPaintSamples?: number[];
  }
}

test.use({ viewport: { width: 1280, height: 800 } });

/** A platform whose scrollbars reserve nothing, plus a sampler that runs from
 *  the document's first frame. Both are served with the HTML so they are in
 *  place before the app's own scripts run. */
async function serveOverlayScrollbarsAndSampler(page: Page) {
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') {
      return route.fallback();
    }
    const response = await route.fetch();
    const injected = `<style>::-webkit-scrollbar { width: 0 !important; height: 0 !important; } * { scrollbar-width: none !important; }</style>
<script>
  window.__composerPaintSamples = [];
  (function sample() {
    var node = document.querySelector('[data-testid="composer-surface"]');
    if (node) {
      var left = Math.round(node.getBoundingClientRect().left * 100) / 100;
      var samples = window.__composerPaintSamples;
      if (samples.length === 0 || samples[samples.length - 1] !== left) {
        samples.push(left);
      }
    }
    if (window.__composerPaintSamples.length < 200) {
      requestAnimationFrame(sample);
    }
  })();
</script>`;
    const body = (await response.text()).replace('<head>', `<head>${injected}`);
    await route.fulfill({ response, body });
  });
}

test.describe('welcome screen first paint', () => {
  test('the composer paints where it stays @scenario:welcome-composer-paints-in-its-final-position', async ({
    page,
  }) => {
    test.setTimeout(60000);
    await serveOverlayScrollbarsAndSampler(page);

    await page.goto('/c/new', { timeout: 10000 });
    await expect(page.locator(COMPOSER)).toBeVisible();
    /** Give the load a second to produce any late correction. */
    await page.waitForTimeout(1500);

    const samples = await page.evaluate(() => window.__composerPaintSamples ?? []);
    expect(samples.length).toBeGreaterThan(0);

    const settled = samples[samples.length - 1];
    const drift = Math.max(...samples.map((left) => Math.abs(left - settled)));
    expect(
      drift,
      `the composer moved horizontally after its first paint: ${JSON.stringify(samples)}`,
    ).toBeLessThanOrEqual(0.5);
  });
});
