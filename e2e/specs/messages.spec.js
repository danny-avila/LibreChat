import { expect, test } from '@playwright/test';

const endpoints = ['google', 'openAI', 'azureOpenAI', 'bingAI', 'chatGPTBrowser', 'gptPlugins'];

test.describe('Messaging suite', () => {

  test('textbox should be focused after receiving message', async ({page}) => {
    test.setTimeout(120000);
    const message = 'hi';
    const endpoint = endpoints[1];

    await page.goto('http://localhost:3080/chat/new');
    await page.locator('#new-conversation-menu').click();
    await page.locator(`#${endpoint}`).click();
    await page.locator('form').getByRole('textbox').click();
    await page.locator('form').getByRole('textbox').fill(message);

    const responsePromise = [
      page.waitForResponse(async (response) => {
        return response.url().includes(`/api/ask/${endpoint}`) && response.status() === 200;
      }),
      page.locator('form').getByRole('textbox').press('Enter')
    ];

    const [response] = await Promise.all(responsePromise);
    const responseBody = await response.body();
    const messageSuccess = responseBody.includes(`"final":true`);
    expect(messageSuccess).toBe(true);

    // Check if textbox is focused
    await page.waitForTimeout(250);
    const isTextboxFocused = await page.evaluate(() => {
      return document.activeElement === document.querySelector('[data-testid="text-input"]');
    });
    expect(isTextboxFocused).toBeTruthy();
  });
});
