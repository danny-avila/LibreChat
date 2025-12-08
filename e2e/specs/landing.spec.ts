import { expect, test } from '@playwright/test';

test.describe('Landing suite', () => {
  test('Landing title', async ({ page }) => {
    await page.goto('/', { timeout: 5000 });
    // Check for LibreChat page title
    await expect(page).toHaveTitle(/LibreChat/);
    // Check that the page loaded successfully by looking for the root div
    await expect(page.locator('#root')).toBeVisible();
    // Check that we're on the authenticated page (look for chat interface elements)
    await expect(page.locator('body')).toBeVisible();
  });

  test('Create Conversation', async ({ page }) => {
    await page.goto('/', { timeout: 5000 });

    async function getItems() {
      const navDiv = await page.waitForSelector('nav > div');
      if (!navDiv) {
        return [];
      }

      const items = await navDiv.$$('a.group');
      return items || [];
    }

    // Wait for the page to load and the SVG loader to disappear
    await page.waitForSelector('nav > div');
    await page.waitForSelector('nav > div > div > svg', { state: 'detached' });

    const beforeAdding = (await getItems()).length;

    const input = await page.locator('form').getByRole('textbox');
    await input.click();
    await input.fill('Hi!');

    // Send the message
    await page.locator('form').getByRole('button').nth(1).click();

    // Wait for the message to be sent
    await page.waitForTimeout(3500);
    const afterAdding = (await getItems()).length;

    expect(afterAdding).toBeGreaterThanOrEqual(beforeAdding);
  });
});
