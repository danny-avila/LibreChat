import { expect, test } from '@playwright/test';

test('Basic test to make sure the app is running', async ({ page }) => {
  await page.goto('http://localhost:3080/');

  await expect(page.locator('#root')).toBeVisible();
  await expect(page).toHaveTitle(/LibreChat/);
});
