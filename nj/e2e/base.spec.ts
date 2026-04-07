import { expect, test } from '@playwright/test';

test('Basic test to make sure the app is running', async ({ page }) => {

  // Navigate to the app
  await page.goto('http://localhost:3080/', { timeout: 5000 });

  // Check that the page has a title
  await expect(page).toHaveTitle(/NJ AI Assistant/);

});