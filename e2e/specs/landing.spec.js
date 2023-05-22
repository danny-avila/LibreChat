import { expect, test } from '@playwright/test';

test.describe('Landing suite', () => {
  let myBrowser;

  test.beforeEach(async ({ browser }) => {
    myBrowser = await browser.newContext({
      storageState: 'e2e/auth.json',
    });
  });

  test('Landing title', async () => {
    const page = await myBrowser.newPage();
    await page.goto('http://localhost:3080/');
    const pageTitle = await page.textContent('#landing-title')
    expect(pageTitle.length).toBeGreaterThan(0);
  });
});
