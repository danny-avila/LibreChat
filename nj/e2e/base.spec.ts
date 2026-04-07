import { expect, test } from '@playwright/test';

test('Basic test to make sure the app is running', async ({ page }) => {
  await page.goto('http://localhost:3080/');

  await expect(page.locator('#root')).toBeVisible();
  await expect(page).toHaveTitle(/LibreChat/);
});

test('Debug app load', async ({ page }) => {
  const response = await page.goto('http://localhost:3080/', {
    waitUntil: 'domcontentloaded',
  });

  console.log('Status:', response?.status());
  console.log('URL:', page.url());
  console.log('Title:', await page.title());
  console.log('HTML snippet:', await page.content());
});
