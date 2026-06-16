import { expect, test } from '@playwright/test';
import {
  NEW_CHAT_PATH,
  getAccessToken,
  mockReply,
  requestJson,
  sendMessage,
  messagesView,
} from '../mock/helpers';

type StartupConfigResponse = {
  modelSpecs?: {
    enforce?: boolean;
  };
};

type ChatPayload = {
  endpoint?: string;
  model?: string;
  spec?: string | null;
};

test.describe('model specs enforcement', () => {
  test('keeps the enforced model spec when URL has plain model override params', async ({
    page,
  }) => {
    test.setTimeout(120000);

    await page.goto(
      `${NEW_CHAT_PATH}?endpoint=${encodeURIComponent('Mock Provider B')}&model=mock-model-b`,
      { timeout: 10000 },
    );

    const token = await getAccessToken(page);
    const startupConfig = await requestJson<StartupConfigResponse>(page, {
      path: '/api/config',
      token,
    });
    expect(startupConfig.modelSpecs?.enforce).toBe(true);

    const response = await sendMessage(
      page,
      'hello from a stale endpoint/model URL with enforced specs',
    );
    expect(response.ok()).toBeTruthy();

    const payload = response.request().postDataJSON() as ChatPayload;
    expect(payload.endpoint).toBe('Mock Provider A');
    expect(payload.model).toBe('mock-model-a');
    expect(payload.spec).toBeTruthy();
    expect(payload.spec).not.toBe('e2e-mock-provider-b');

    await expect(mockReply(page)).toBeVisible({ timeout: 30000 });
    await expect(messagesView(page).getByText('No model spec selected')).toHaveCount(0);
  });
});
