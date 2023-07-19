/* eslint-disable no-undef */
import { expect, test } from '@playwright/test';

test.describe('Landing suite', () => {
  test('Landing title', async ({ page }) => {
    await page.goto('http://localhost:3080/');
    const pageTitle = await page.textContent('#landing-title');
    expect(pageTitle.length).toBeGreaterThan(0);
  });

  test('Create Conversation', async ({ page }) => {
    await page.goto('http://localhost:3080/');

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

    let beforeAdding = (await getItems()).length;

    const input = await page.locator('form').getByRole('textbox');
    await input.click();
    await input.fill('Hi!');

    // Send the message
    await page.locator('form').getByRole('button').nth(1).click();

    // Wait for the message to be sent
    await page.waitForTimeout(3500);
    let afterAdding = (await getItems()).length;

    expect(afterAdding).toBeGreaterThanOrEqual(beforeAdding);
  });
});
