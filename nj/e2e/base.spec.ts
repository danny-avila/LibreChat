import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('Input form should be accessible', async ({ page }) => {
  await page.goto('http://localhost:3080/', { timeout: 5000 });

  const formAccessibilityScanResults = await new AxeBuilder({ page }).include('form').analyze();

  expect(formAccessibilityScanResults.violations).toEqual([]);
});