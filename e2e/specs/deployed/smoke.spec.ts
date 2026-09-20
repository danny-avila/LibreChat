import { expect, test } from '@playwright/test';
import type { Page, Response } from '@playwright/test';

const baseURL = new URL(process.env.E2E_BASE_URL as string);
baseURL.pathname = baseURL.pathname.replace(/\/?$/, '/');

const newChatURL = new URL('c/new', baseURL);
const configuredModel = process.env.E2E_DEPLOYED_MODEL?.trim();
const prompt = process.env.E2E_DEPLOYED_PROMPT?.trim() || 'Reply with exactly DEPLOYED_E2E_OK.';

type GenerationStart = {
  conversationId?: string;
};

function isGenerationStart(response: Response) {
  const { pathname } = new URL(response.url());
  return (
    response.request().method() === 'POST' &&
    (pathname.endsWith('/api/agents/chat') || pathname.includes('/api/agents/chat/')) &&
    !pathname.endsWith('/abort') &&
    response.status() === 200
  );
}

async function selectConfiguredModel(page: Page) {
  const modelSelector = page.getByTestId('model-selector-button');
  const selectorIsVisible = await modelSelector
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => true)
    .catch(() => false);

  if (!selectorIsVisible) {
    if (configuredModel) {
      throw new Error(
        '[e2e:deployed] E2E_DEPLOYED_MODEL cannot be applied because this deployment hides model selection.',
      );
    }
    return;
  }

  if (configuredModel) {
    if ((await modelSelector.textContent())?.includes(configuredModel)) {
      return;
    }
    await modelSelector.click();
    await page.locator('#model-search').fill(configuredModel);
    await page.getByRole('option', { name: configuredModel, exact: true }).first().click();
    await expect(modelSelector).toContainText(configuredModel);
  }
}

async function loadAuthenticatedApp(page: Page) {
  await page.addInitScript((appOrigin) => {
    if (location.origin !== appOrigin) {
      return;
    }
    /** The persistence probe must not inherit a dedicated account's temporary-chat default.
     * These changes live only in this browser context; the storage-state file is never rewritten. */
    localStorage.setItem('isTemporary', 'false');
    localStorage.setItem('defaultTemporaryChat', 'false');
  }, baseURL.origin);
  await page.goto(newChatURL.toString(), { waitUntil: 'domcontentloaded' });

  const input = page.getByTestId('text-input');
  try {
    await expect(input).toBeVisible({ timeout: 20_000 });
  } catch (error) {
    const currentURL = new URL(page.url());
    if (currentURL.origin !== baseURL.origin || currentURL.pathname.includes('/login')) {
      throw new Error(
        `[e2e:deployed] Authentication state is missing or expired; the deployment redirected to ${currentURL.origin}.`,
        { cause: error },
      );
    }
    throw error;
  }

  expect(new URL(page.url()).origin).toBe(baseURL.origin);
  await expect(page).toHaveURL(/\/c\/new\/?$/);
  return input;
}

async function deleteConversation(page: Page, conversationId: string) {
  const result = await page.evaluate(
    async ({ appBaseURL, id }) => {
      const signal = AbortSignal.timeout(15_000);
      const refreshResponse = await fetch(new URL('api/auth/refresh', appBaseURL), {
        method: 'POST',
        credentials: 'include',
        signal,
      });
      if (!refreshResponse.ok) {
        return { ok: false, step: 'refresh', status: refreshResponse.status };
      }

      const { token } = (await refreshResponse.json()) as { token?: string };
      if (!token) {
        return {
          ok: false,
          step: 'refresh-token',
          status: refreshResponse.status,
        };
      }

      const deleteResponse = await fetch(new URL('api/convos', appBaseURL), {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        signal,
        body: JSON.stringify({
          arg: { conversationId: id, source: 'e2e-deployed' },
        }),
      });
      return {
        ok: deleteResponse.ok,
        step: 'delete',
        status: deleteResponse.status,
      };
    },
    { appBaseURL: baseURL.toString(), id: conversationId },
  );

  if (!result.ok) {
    throw new Error(
      `[e2e:deployed] Conversation cleanup failed during ${result.step} (${result.status}).`,
    );
  }
}

test.describe('deployed LibreChat smoke', () => {
  test('loads the authenticated shell and persists a real conversation', async ({ page }) => {
    test.setTimeout(240_000);
    let conversationId: string | undefined;

    try {
      const input = await loadAuthenticatedApp(page);

      await selectConfiguredModel(page);

      const messageBodies = page.getByTestId('message-body');
      const initialMessageCount = await messageBodies.count();
      await input.fill(prompt);

      const sendButton = page.getByTestId('send-button');
      const canSubmit = await expect(sendButton)
        .toBeEnabled({ timeout: 5_000 })
        .then(() => true)
        .catch(() => false);
      if (!canSubmit) {
        throw new Error(
          '[e2e:deployed] The prompt cannot be submitted. Set E2E_DEPLOYED_MODEL when the account has no default model.',
        );
      }

      const [generationResponse] = await Promise.all([
        page.waitForResponse(isGenerationStart, { timeout: 30_000 }),
        sendButton.click(),
      ]);
      const generation = (await generationResponse.json()) as GenerationStart;
      conversationId = generation.conversationId;
      expect(conversationId).toBeTruthy();
      expect(conversationId).not.toBe('new');

      await expect(page).toHaveURL(new RegExp(`/c/${conversationId}/?$`));
      await expect(
        page.getByTestId('messages-view').getByText(prompt, { exact: true }),
      ).toBeVisible();
      await expect
        .poll(() => messageBodies.count(), { timeout: 90_000 })
        .toBeGreaterThan(initialMessageCount + 1);
      await expect(page.getByTestId('stop-generation-button')).toBeHidden({
        timeout: 90_000,
      });
      await expect(messageBodies.last()).not.toBeEmpty();
      await expect(messageBodies.getByRole('alert')).toHaveCount(0);

      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(
        page.getByTestId('messages-view').getByText(prompt, { exact: true }),
      ).toBeVisible({
        timeout: 30_000,
      });
      await expect
        .poll(() => messageBodies.count(), { timeout: 30_000 })
        .toBeGreaterThan(initialMessageCount + 1);
    } finally {
      if (conversationId) {
        await deleteConversation(page, conversationId);
      }
    }
  });
});
