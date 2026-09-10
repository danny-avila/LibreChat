import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import translations from '../../../../client/src/locales/en/translation.json';

type MockAgent = {
  id: string;
  name: string;
  description: string;
  category: string;
  avatar: null;
  created_at: number;
  provider: string;
  model: string;
  model_parameters: Record<string, null>;
};

const responseFor = (agent: MockAgent) => ({
  object: 'list',
  data: [agent],
  first_id: agent.id,
  last_id: agent.id,
  has_more: false,
});

const makeAgent = (suffix: string): MockAgent => ({
  id: `agent-marketplace-recovery-${suffix}`,
  name: `Marketplace Recovery Agent ${suffix}`,
  description: 'A known agent returned by the marketplace recovery scenario.',
  category: 'general',
  avatar: null,
  created_at: Date.now(),
  provider: 'openAI',
  model: 'gpt-4',
  model_parameters: {
    temperature: null,
    maxContextTokens: null,
    maxOutputTokens: null,
    top_p: null,
    presence_penalty: null,
    frequency_penalty: null,
  },
});

const routeMarketplace = async (page: Page, handler: (route: Route) => Promise<void>) => {
  await page.route('**/api/agents*', async (route) => {
    const requestUrl = new URL(route.request().url());
    if (route.request().method() !== 'GET' || requestUrl.pathname !== '/api/agents') {
      await route.continue();
      return;
    }
    await handler(route);
  });
};
test.describe('marketplace recovery', () => {
  test('@scenario:failed-marketplace-load-retries-itself retries a failed marketplace load without user interaction', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const agent = makeAgent('automatic');
    let listRequests = 0;

    /* The query itself absorbs the first failure and two immediate retries
       (`client/src/data-provider/Agents/queries.ts`), so the error card only appears after
       three, and each of the card's own attempts costs another three. The failures walk
       through every status the marketplace treats as transient: a run that classified 429
       or 408 as final would stop attempting there and never reach the served page. */
    const failureStatuses = [500, 500, 500, 429, 429, 429, 408, 408, 408];
    await routeMarketplace(page, async (route) => {
      listRequests += 1;
      const status = failureStatuses[listRequests - 1];
      if (status != null) {
        await route.fulfill({
          status,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'marketplace unavailable' }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(responseFor(agent)),
      });
    });

    await page.goto('/agents/all');
    /* The card retitles itself as the failures change status, so match any of the three
       rather than racing whichever one is on screen when the assertion runs. */
    await expect(page.getByRole('alert')).toContainText(
      new RegExp(
        [
          translations.com_agents_error_server_title,
          translations.com_agents_error_rate_limit_title,
          translations.com_agents_error_timeout_title,
        ].join('|'),
      ),
    );
    await expect(page.getByRole('button', { name: agent.name })).toBeVisible({ timeout: 45_000 });
    expect(listRequests).toBeGreaterThan(failureStatuses.length);
  });

  test('@scenario:missing-marketplace-page-stays-neutral keeps a missing marketplace page neutral without automatic retries', async ({
    page,
  }) => {
    let listRequests = 0;

    await routeMarketplace(page, async (route) => {
      listRequests += 1;
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'marketplace page not found' }),
      });
    });

    await page.goto('/agents/all');
    const alert = page.getByRole('alert');
    await expect(alert).toContainText(translations.com_agents_error_not_found_title);
    await expect(alert).toContainText(translations.com_agents_error_not_found_message);
    /* The neutral kind is the one the card does not keep re-attempting: no countdown is
       offered, and the request count stays where the first load left it. */
    await expect(page.getByText(/Retrying automatically in \d+s/)).toHaveCount(0);

    const settledRequests = listRequests;
    await expect.poll(() => listRequests, { timeout: 3500 }).toBe(settledRequests);
  });

  test('@scenario:returning-to-the-window-retries-once retries exactly once when the window returns', async ({
    page,
  }) => {
    const agent = makeAgent('window-return');
    let listRequests = 0;
    let recovered = false;

    await routeMarketplace(page, async (route) => {
      listRequests += 1;
      if (!recovered) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'marketplace unavailable' }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(responseFor(agent)),
      });
    });

    await page.goto('/agents/all');
    await expect(page.getByRole('alert')).toContainText(translations.com_agents_error_server_title);
    /* Wait for a long backoff step, so the attempt observed below is the one the window
       return caused and not the step that happened to be due. */
    await expect(page.getByText(/Retrying automatically in ([4-9]|\d\d)s/)).toBeVisible({
      timeout: 30_000,
    });

    recovered = true;
    const beforeReturn = listRequests;
    await page.evaluate(() => {
      window.dispatchEvent(new Event('blur'));
      window.dispatchEvent(new Event('focus'));
    });

    await expect(page.getByRole('button', { name: agent.name })).toBeVisible({ timeout: 30_000 });
    /* Exactly one: the return replaces the attempt the backoff had pending instead of
       firing alongside it. The served page also succeeds, so it costs no query retry. */
    expect(listRequests).toBe(beforeReturn + 1);
    await expect.poll(() => listRequests, { timeout: 3000 }).toBe(beforeReturn + 1);
  });
});
