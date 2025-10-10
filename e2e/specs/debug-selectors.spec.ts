import { test } from '@playwright/test';

const BASE_URL = 'http://localhost:3080';
const DEMO_USER = {
  email: 'sales-demo@senticor.de',
  password: 'SalesDemo2025!Secure',
};

test('Debug: Check what selectors are available', async ({ page }) => {
  // Login
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[name="email"]', DEMO_USER.email);
  await page.fill('input[name="password"]', DEMO_USER.password);
  await page.click('button[type="submit"]');

  await page.waitForURL(/\/c\//, { timeout: 10000 });
  console.log('✅ Logged in');

  // Navigate to new conversation
  await page.goto(`${BASE_URL}/c/new`);
  await page.waitForTimeout(3000);

  // Take screenshot
  await page.screenshot({ path: '/tmp/debug-new-chat.png', fullPage: true });
  console.log('📸 Screenshot saved: /tmp/debug-new-chat.png');

  // Check for various possible selectors
  const selectors = [
    '#new-conversation-menu',
    '[data-testid="new-conversation-menu"]',
    'button:has-text("Agents")',
    '[role="combobox"]',
    'select',
    '[data-testid="endpoint-menu"]',
    '[aria-label*="endpoint"]',
    '[aria-label*="model"]',
  ];

  for (const selector of selectors) {
    const element = await page.locator(selector).first();
    const count = await page.locator(selector).count();
    const isVisible = count > 0 ? await element.isVisible().catch(() => false) : false;
    console.log(`${selector}: count=${count}, visible=${isVisible}`);
  }

  // Print all buttons
  const buttons = await page.locator('button').all();
  console.log(`\nTotal buttons found: ${buttons.length}`);
  for (let i = 0; i < Math.min(buttons.length, 20); i++) {
    const text = await buttons[i].innerText().catch(() => '');
    const id = await buttons[i].getAttribute('id').catch(() => '');
    const testId = await buttons[i].getAttribute('data-testid').catch(() => '');
    if (text || id || testId) {
      console.log(`Button ${i}: id="${id}" testid="${testId}" text="${text.substring(0, 30)}"`);
    }
  }

  await page.waitForTimeout(5000);
});
