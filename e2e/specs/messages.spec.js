import { test } from '@playwright/test';

test.describe('Messaging suite', () => {
  let myBrowser;

  test.beforeEach(async ({ browser }) => {
    myBrowser = await browser.newContext({
      storageState: 'e2e/auth.json',
    });
  });

  test('textbox should be focused after receiving message', async () => {
    test.setTimeout(120000);
    const page = await myBrowser.newPage();
    await page.goto('http://localhost:3080/chat/new');
    await page.locator("#new-conversation-menu").click();
    await page.locator('#google').click();
    await page.locator('form').getByRole('textbox').click();
    await page.locator('form').getByRole('textbox').fill('hi');
    // await page.waitForSelector('button', { name: 'regenerate' });
    
    const responsePromise = [
      page.waitForResponse(async (response) => {
        return response.url().includes('/api/ask/google') && response.status() === 200;
      }),
      page.locator('form').getByRole('textbox').press('Enter'),
    ];

    const [response] = await Promise.all(responsePromise);
    const responseBody = await response.body();
  
    if (responseBody.includes(`"final":true`)) {
      console.log("Message is final!");
      // Continue with the test logic
    }

  });


});
