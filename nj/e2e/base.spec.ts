import { expect, test } from '@playwright/test';

/*
  General test to make sure the app is running.
  Authentication and other setup steps are handled in the global setup file (e2e/setup/authenticate.ts).
*/

test('Basic test to make sure the app is running', async ({ page }) => {
  await page.goto('http://localhost:3080/', { timeout: 5000 });

  // Wait for the page to load and the SVG loader to disappear
  await page.waitForSelector('nav > div');
  await page.waitForSelector('nav > div > div > svg', { state: 'detached' });

  // Check that the main app container is visible and the title is correct
  await expect(page.locator('#root')).toBeVisible();

  // Check that the title contains "NJ AI Assistant"
  await expect(page).toHaveTitle(/NJ AI Assistant/);
});
