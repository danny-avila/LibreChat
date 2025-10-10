import { test } from '@playwright/test';

const BASE_URL = 'http://localhost:3080';
const DEMO_USER = {
  email: 'sales-demo@senticor.de',
  password: 'SalesDemo2025!Secure',
};

test('Debug: Find Agents selector', async ({ page }) => {
  // Login
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[name="email"]', DEMO_USER.email);
  await page.fill('input[name="password"]', DEMO_USER.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/c\//, { timeout: 10000 });
  console.log('✅ Logged in');

  // Navigate to new conversation
  await page.goto(`${BASE_URL}/c/new`);
  await page.waitForTimeout(2000);

  // Click the combobox
  console.log('Clicking combobox...');
  await page.locator('[role="combobox"]').first().click();
  await page.waitForTimeout(2000);

  // Take screenshot of dropdown
  await page.screenshot({ path: '/tmp/debug-dropdown.png', fullPage: true });
  console.log('📸 Screenshot saved: /tmp/debug-dropdown.png');

  // List all visible options
  const options = await page.locator('[role="option"]').all();
  console.log(`\nFound ${options.length} options:`);
  for (let i = 0; i < options.length; i++) {
    const text = await options[i].innerText().catch(() => '');
    const isVisible = await options[i].isVisible().catch(() => false);
    console.log(`  Option ${i}: "${text}" (visible: ${isVisible})`);
  }

  // Try to find anything with "Agent"
  const agentElements = await page.locator('*:has-text("Agent")').all();
  console.log(`\nFound ${agentElements.length} elements containing "Agent":`);
  for (let i = 0; i < Math.min(agentElements.length, 10); i++) {
    const text = await agentElements[i].innerText().catch(() => '');
    const tagName = await agentElements[i].evaluate(el => el.tagName).catch(() => '');
    console.log(`  Element ${i} (${tagName}): "${text.substring(0, 50)}"`);
  }

  await page.waitForTimeout(5000);
});
