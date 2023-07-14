import { expect, test } from '@playwright/test';

const basePath = 'http://localhost:3080/chat/';
const initialUrl = `${basePath}new`;
const endpoints = ['google', 'openAI', 'azureOpenAI', 'bingAI', 'chatGPTBrowser', 'gptPlugins'];
function isUUID(uuid) {
  let regex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  return regex.test(uuid);
}

test.describe('Messaging suite', () => {

  test('textbox should be focused after receiving message & test expected navigation', async ({ page }) => {
    test.setTimeout(120000);
    const message = 'hi';
    const endpoint = endpoints[1];
    const initialUrl = 'http://localhost:3080/chat/new';

    await page.goto(initialUrl);
    await page.locator('#new-conversation-menu').click();
    await page.locator(`#${endpoint}`).click();
    await page.locator('form').getByRole('textbox').click();
    await page.locator('form').getByRole('textbox').fill(message);

    const responsePromise = [
      page.waitForResponse(async (response) => {
        return response.url().includes(`/api/ask/${endpoint}`) && response.status() === 200;
      }),
      page.locator('form').getByRole('textbox').press('Enter'),
    ];

    const [response] = await Promise.all(responsePromise);
    const responseBody = await response.body();
    const messageSuccess = responseBody.includes('"final":true');
    expect(messageSuccess).toBe(true);

    // Check if textbox is focused
    await page.waitForTimeout(250);
    const isTextboxFocused = await page.evaluate(() => {
      return document.activeElement === document.querySelector('[data-testid="text-input"]');
    });
    expect(isTextboxFocused).toBeTruthy();
    const currentUrl = page.url();
    expect(currentUrl).toBe(initialUrl);

    //cleanup the conversation
    await page.getByRole('navigation').getByRole('button').nth(1).click();
    expect(page.url()).toBe(initialUrl);
    await page.getByTestId('convo-item').nth(1).click();
    const finalUrl = page.url();
    const conversationId = finalUrl.split(basePath).pop();
    expect(isUUID(conversationId)).toBeTruthy();
  });

  // in this spec as we are testing post-message navigation, we are not testing the message response
  test('Page navigations', async ({ page }) => {
    await page.goto(initialUrl);
    await page.getByTestId('convo-item').nth(1).click();
    const currentUrl = page.url();
    const conversationId = currentUrl.split(basePath).pop();
    expect(isUUID(conversationId)).toBeTruthy();
    await page.getByText('New chat', { exact: true }).click();
    expect(page.url()).toBe(initialUrl);
  });
});
