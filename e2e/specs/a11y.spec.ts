import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { acceptTermsIfPresent } from '../utils/acceptTermsIfPresent';

test('Landing page should not have any automatically detectable accessibility issues', async ({ page }) => {
  await page.goto('http://localhost:3080/', { timeout: 5000 });
  // Accept the Terms &amp; Conditions modal if it appears.
  await acceptTermsIfPresent(page);
  // Using AxeBuilder – here you may filter violations you want to ignore.
  const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
  expect(accessibilityScanResults.violations).toEqual([]);
});

test('Conversation page should be accessible', async ({ page }) => {
  await page.goto('http://localhost:3080/', { timeout: 5000 });
  // Assume a conversation is created when the message input is visible.
  const input = await page.locator('form').getByRole('textbox');
  await input.click();
  await input.fill('Hi!');
  // Click the send button (if that is how a message is submitted)
  await page.getByTestId('send-button').click();
  // Wait briefly for any updates
  await page.waitForTimeout(3500);
  const results = await new AxeBuilder({ page }).analyze();
  // Here we do no filtering – adjust as needed.
  expect(results.violations).toEqual([]);
});

test('Navigation elements should be accessible', async ({ page }) => {
  await page.goto('http://localhost:3080/', { timeout: 5000 });
  // For example, check the nav (using the data-testid from the provided HTML)
  const nav = await page.getByTestId('nav');
  expect(await nav.isVisible()).toBeTruthy();
});

test('Input form should be accessible', async ({ page }) => {
  await page.goto('http://localhost:3080/', { timeout: 5000 });
  const form = await page.locator('form');
  expect(await form.isVisible()).toBeTruthy();
  const results = await new AxeBuilder({ page }).include('form').analyze();
  expect(results.violations).toEqual([]);
});