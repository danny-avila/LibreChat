import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright'; // 1

test('Landing page should not have any automatically detectable accessibility issues', async ({
  page,
}) => {
  await page.goto('http://localhost:3080/', { timeout: 5000 });

  const accessibilityScanResults = await new AxeBuilder({ page }).analyze();

  expect(accessibilityScanResults.violations).toEqual([]);
});

test('Conversation page should be accessible', async ({ page }) => {
  await page.goto('http://localhost:3080/', { timeout: 5000 });

  // Create a conversation (you may need to adjust this based on your app's behavior)
  const input = await page.locator('form').getByRole('textbox');
  await input.click();
  await input.fill('Hi!');
  await page.locator('form').getByRole('button').nth(1).click();
  await page.waitForTimeout(3500);

  const accessibilityScanResults = await new AxeBuilder({ page }).analyze();

  expect(accessibilityScanResults.violations).toEqual([]);
});

test('Navigation elements should be accessible', async ({ page }) => {
  await page.goto('http://localhost:3080/', { timeout: 5000 });

  const navAccessibilityScanResults = await new AxeBuilder({ page }).include('nav').analyze();

  expect(navAccessibilityScanResults.violations).toEqual([]);
});

test('Input form should be accessible', async ({ page }) => {
  await page.goto('http://localhost:3080/', { timeout: 5000 });

  const formAccessibilityScanResults = await new AxeBuilder({ page }).include('form').analyze();

  expect(formAccessibilityScanResults.violations).toEqual([]);
});
