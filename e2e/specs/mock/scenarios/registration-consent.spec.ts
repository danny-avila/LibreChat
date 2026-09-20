import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';

/**
 * Registration is where a deployment's policies are agreed to, so it is where
 * the consent is stated, with a direct link to each policy the deployment
 * published. The sentence is worded for what is configured: a deployment that
 * published only one of them must not claim the reader agreed to the other, and
 * one that published neither says nothing at all.
 *
 * These run unauthenticated, because an authenticated session redirects away
 * from `/register` before anything renders.
 */

const PRIVACY_URL = 'https://example.com/privacy';
const TERMS_URL = 'https://example.com/terms';

/** The harness deployment configures no policies, so a spec that needs them
 *  answers the startup config for itself. The rest of `interface` is preserved:
 *  replacing it would take the page's own capabilities with it. */
async function withPolicies(page: Page, policies: Record<string, unknown>) {
  await page.route('**/api/config', async (route) => {
    const response = await route.fetch();
    const config = await response.json();
    await route.fulfill({
      response,
      json: { ...config, interface: { ...config.interface, ...policies } },
    });
  });
}

/** A signed-out visitor, which is the only one who ever reaches `/register`. */
async function openRegistration(
  browser: Browser,
  baseURL: string | undefined,
  policies: Record<string, unknown>,
) {
  const context = await browser.newContext({ storageState: undefined, baseURL });
  const page = await context.newPage();
  await withPolicies(page, policies);
  await page.goto('/register', { timeout: 15000 });
  await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible({ timeout: 15000 });
  return { context, page };
}

test.describe('registration consent', () => {
  test('registration states the consent with a link to each policy @scenario:registration-states-the-policy-consent', async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(60000);
    const { context, page } = await openRegistration(browser, baseURL, {
      privacyPolicy: { externalUrl: PRIVACY_URL },
      termsOfService: { externalUrl: TERMS_URL },
    });

    try {
      await expect(page.getByText(/By continuing, you agree to the/i)).toBeVisible();

      /** One link each: the page states the consent instead of also carrying the
       *  footer bar that used to repeat both links beneath it. */
      const privacy = page.locator(`a[href="${PRIVACY_URL}"]`);
      const terms = page.locator(`a[href="${TERMS_URL}"]`);
      await expect(privacy).toHaveCount(1);
      await expect(terms).toHaveCount(1);
      await expect(privacy).toBeVisible();
      await expect(terms).toBeVisible();

      /** The links are read by name, so they carry their own text rather than
       *  leaving a screen reader with the sentence around them. */
      await expect(privacy).toHaveText('Privacy Policy');
      await expect(terms).toHaveText('Terms of Service');

      /** Reachable by keyboard from the field above, not only by pointer. */
      await terms.focus();
      await expect(terms).toBeFocused();
    } finally {
      await context.close();
    }
  });

  test('the consent names only the policy the deployment published @scenario:registration-consent-names-only-the-published-policy', async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(60000);
    const { context, page } = await openRegistration(browser, baseURL, {
      privacyPolicy: { externalUrl: PRIVACY_URL },
      termsOfService: undefined,
    });

    try {
      await expect(page.getByText(/By continuing, you acknowledge the/i)).toBeVisible();
      await expect(page.locator(`a[href="${PRIVACY_URL}"]`)).toHaveCount(1);
      await expect(page.getByText(/agree to the Terms of Service/i)).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test('a deployment with no policies states no consent @scenario:registration-without-policies-states-no-consent', async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(60000);
    const { context, page } = await openRegistration(browser, baseURL, {});

    try {
      await expect(page.getByRole('button', { name: 'Submit registration' })).toBeVisible();
      await expect(page.getByText(/By continuing/i)).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});
