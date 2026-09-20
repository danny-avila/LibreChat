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
  await expect(modelSelector).toBeVisible();

  if (configuredModel) {
    if ((await modelSelector.textContent())?.includes(configuredModel)) {
      return;
    }
    await modelSelector.click();
    await page.getByRole('option', { name: configuredModel, exact: true }).click();
    await expect(modelSelector).toContainText(configuredModel);
    return;
  }

  if ((await modelSelector.textContent())?.trim() === 'Select a model') {
    throw new Error(
      '[e2e:deployed] No model is selected. Set E2E_DEPLOYED_MODEL to a configured model label.',
    );
  }
}

async function loadAuthenticatedApp(page: Page) {
  await page.goto(newChatURL.toString(), { waitUntil: 'domcontentloaded' });

  const input = page.getByRole('textbox', { name: 'Message input' });
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
      const refreshResponse = await fetch(new URL('api/auth/refresh', appBaseURL), {
        method: 'POST',
        credentials: 'include',
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
    test.setTimeout(120_000);
    let conversationId: string | undefined;

    try {
      const input = await loadAuthenticatedApp(page);

      await selectConfiguredModel(page);

      const messageBodies = page.getByTestId('message-body');
      const initialMessageCount = await messageBodies.count();
      await input.fill(prompt);

      const [generationResponse] = await Promise.all([
        page.waitForResponse(isGenerationStart, { timeout: 30_000 }),
        input.press('Enter'),
      ]);
      const generation = (await generationResponse.json()) as GenerationStart;
      conversationId = generation.conversationId;
      expect(conversationId).toBeTruthy();
      expect(conversationId).not.toBe('new');

      await expect(page).toHaveURL(new RegExp(`/c/${conversationId}/?$`));
      await expect(messageBodies).toHaveCount(initialMessageCount + 2, {
        timeout: 90_000,
      });
      await expect(page.getByRole('button', { name: 'Stop generating' })).toBeHidden({
        timeout: 90_000,
      });
      await expect(messageBodies.last()).not.toBeEmpty();
      await expect(messageBodies.last().getByRole('alert')).toHaveCount(0);

      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(
        page.getByTestId('messages-view').getByText(prompt, { exact: true }),
      ).toBeVisible({
        timeout: 30_000,
      });
      await expect(messageBodies).toHaveCount(initialMessageCount + 2, {
        timeout: 30_000,
      });
    } finally {
      if (conversationId) {
        await deleteConversation(page, conversationId);
      }
    }
  });
});
