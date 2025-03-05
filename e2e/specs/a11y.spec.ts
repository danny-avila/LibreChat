import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { acceptTermsIfPresent } from '../utils/acceptTermsIfPresent';

/**
 * Filters Axe violations to include only those with a "serious" or "critical" impact.
 * (Adjust this function if you want to ignore specific rule IDs instead.)
 */
function filterViolations(violations: any[]) {
  return violations.filter(v => v.impact === 'critical' || v.impact === 'serious');
}

test('Landing page should not have any automatically detectable accessibility issues', async ({ page }) => {
  await page.goto('http://localhost:3080/', { timeout: 5000 });
  // Accept the Terms & Conditions modal if it appears.
  await acceptTermsIfPresent(page);
  // Run Axe accessibility scan.
  const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
  // Only fail if there are violations with high impact.
  const violations = filterViolations(accessibilityScanResults.violations);
  expect(violations).toEqual([]);
});

test('Conversation page should be accessible', async ({ page }) => {
  await page.goto('http://localhost:3080/', { timeout: 5000 });
  // Simulate creating a conversation by waiting for the message input.
  const input = page.locator('form').getByRole('textbox');
  await input.click();
  await input.fill('Hi!');
  // Click the send button (if that is how a message is submitted)
  await page.getByTestId('send-button').click();
  // Wait briefly for updates.
  await page.waitForTimeout(3500);
  const results = await new AxeBuilder({ page }).analyze();
  const violations = filterViolations(results.violations);
  expect(violations).toEqual([]);
});

test('Navigation elements should be accessible', async ({ page }) => {
  await page.goto('http://localhost:3080/', { timeout: 5000 });
  const nav = await page.getByTestId('nav');
  expect(await nav.isVisible()).toBeTruthy();
});

test('Input form should be accessible', async ({ page }) => {
  await page.goto('http://localhost:3080/', { timeout: 5000 });
  // Ensure the form is rendered by starting a new conversation.
  await page.getByTestId('nav-new-chat-button').click();
  const form = page.locator('form');
  // Sometimes the form may take a moment to appear.
  await form.waitFor({ state: 'visible', timeout: 5000 });
  expect(await form.isVisible()).toBeTruthy();
  const results = await new AxeBuilder({ page }).include('form').analyze();
  const violations = filterViolations(results.violations);
  expect(violations).toEqual([]);
});