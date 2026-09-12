import { randomUUID } from 'crypto';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { getE2EUser } from '../../../setup/user';
import { deleteConversations, deleteMessagesByConversation, seedConversations } from '../db';

/**
 * Whether a conversation carries a footer is an answer from the startup config,
 * and on a cold load of `/c/<id>` that answer arrives after the composer has
 * already been painted. Guessing "no footer" until then moves the composer twice
 * — down to the bare clearance, then back up when the footer appears.
 */

const COMPOSER = '[data-testid="composer-surface"]';
const CUSTOM_FOOTER = 'Operator policy footer';
const CONVERSATION_TITLE = 'Cold load clearance';

declare global {
  interface Window {
    /** Every composer bottom painted since the document started. */
    __composerBottomSamples?: number[];
  }
}

test.use({ viewport: { width: 1280, height: 800 } });

/** A configured footer whose answer is deliberately slow, plus a sampler that
 *  runs from the document's first frame. Both are in place before the app's own
 *  scripts, so nothing about the app's own timing is assumed. */
async function serveSlowConfiguredFooter(page: Page) {
  await page.route('**/api/config', async (route) => {
    const response = await route.fetch();
    const config = await response.json();
    const delayed = Promise.withResolvers<void>();
    setTimeout(() => delayed.resolve(), 700);
    await delayed.promise;
    await route.fulfill({ response, json: { ...config, customFooter: CUSTOM_FOOTER } });
  });
  await installSampler(page);
}

/** A sampler that records the composer's bottom from the document's first frame,
 *  served with the HTML so it is in place before the app's own scripts. */
async function installSampler(page: Page) {
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') {
      return route.fallback();
    }
    const response = await route.fetch();
    const sampler = `<script>
  window.__composerBottomSamples = [];
  (function sample() {
    var node = document.querySelector('[data-testid="composer-surface"]');
    if (node) {
      var bottom = Math.round(node.getBoundingClientRect().bottom * 100) / 100;
      var samples = window.__composerBottomSamples;
      if (samples.length === 0 || samples[samples.length - 1] !== bottom) {
        samples.push(bottom);
      }
    }
    if (window.__composerBottomSamples.length < 200) {
      requestAnimationFrame(sample);
    }
  })();
</script>`;
    const body = (await response.text()).replace('<head>', `<head>${sampler}`);
    await route.fulfill({ response, body });
  });
}

test.describe('cold load clearance', () => {
  test('the composer does not jump when the configured footer arrives @scenario:configured-footer-clearance-survives-a-cold-load', async ({
    page,
  }) => {
    test.setTimeout(60000);
    const conversationId = randomUUID();
    await seedConversations(getE2EUser().email, [
      { conversationId, title: CONVERSATION_TITLE, updatedAt: new Date() },
    ]);

    try {
      await serveSlowConfiguredFooter(page);
      /** The first visit is what records the deployment's answer; the load under
       *  test is every one after it, where the composer must lay out once. */
      await page.goto(`/c/${conversationId}`, { timeout: 15000 });
      await expect(page.getByText(CUSTOM_FOOTER)).toBeVisible({ timeout: 15000 });
      await page.goto(`/c/${conversationId}`, { timeout: 15000 });
      await expect(page.locator(COMPOSER)).toBeVisible();
      /** Past the delayed config answer and any correction it would cause. */
      await expect(page.getByText(CUSTOM_FOOTER)).toBeVisible({ timeout: 15000 });
      await page.waitForTimeout(800);

      const samples = await page.evaluate(() => window.__composerBottomSamples ?? []);
      expect(samples.length).toBeGreaterThan(0);
      const settled = samples[samples.length - 1];
      const drift = Math.max(...samples.map((bottom) => Math.abs(bottom - settled)));
      expect(
        drift,
        `the composer moved when the configured footer arrived: ${JSON.stringify(samples)}`,
      ).toBeLessThanOrEqual(0.5);
    } finally {
      await deleteMessagesByConversation([conversationId]);
      await deleteConversations([conversationId]);
    }
  });
});

/** A deployment that configures nothing is the common one, and its cold load has
 *  the same right to lay out once: reserving the band "just in case" and dropping
 *  it when the config answers moves the composer 24px down. */
async function serveSlowDefaultConfig(page: Page) {
  await page.route('**/api/config', async (route) => {
    const response = await route.fetch();
    const config = await response.json();
    const delayed = Promise.withResolvers<void>();
    setTimeout(() => delayed.resolve(), 700);
    await delayed.promise;
    await route.fulfill({ response, json: { ...config, customFooter: undefined } });
  });
  await installSampler(page);
}

test.describe('cold load clearance without a footer', () => {
  test('the composer does not jump when the config confirms no footer @scenario:default-clearance-survives-a-cold-load', async ({
    page,
  }) => {
    test.setTimeout(60000);
    const conversationId = randomUUID();
    await seedConversations(getE2EUser().email, [
      { conversationId, title: 'Default clearance', updatedAt: new Date() },
    ]);

    try {
      await serveSlowDefaultConfig(page);
      await page.goto(`/c/${conversationId}`, { timeout: 15000 });
      await expect(page.locator(COMPOSER)).toBeVisible();
      /** Past the delayed answer and any correction it would cause. */
      await page.waitForTimeout(1800);

      const samples = await page.evaluate(() => window.__composerBottomSamples ?? []);
      expect(samples.length).toBeGreaterThan(0);
      const settled = samples[samples.length - 1];
      const drift = Math.max(...samples.map((bottom) => Math.abs(bottom - settled)));
      expect(
        drift,
        `the composer moved when the config answered: ${JSON.stringify(samples)}`,
      ).toBeLessThanOrEqual(0.5);
    } finally {
      await deleteMessagesByConversation([conversationId]);
      await deleteConversations([conversationId]);
    }
  });
});
