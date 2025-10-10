import { test } from '@playwright/test';

const BASE_URL = 'http://localhost:3080';
const DEMO_USER = {
  email: 'sales-demo@senticor.de',
  password: 'SalesDemo2025!Secure',
};

test('Debug: Find correct model/endpoint selector', async ({ page }) => {
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

  // Find the button that shows the current model (gpt-5)
  console.log('Looking for model selector button...');

  // Try clicking button with text gpt-5
  const gptButton = page.locator('button:has-text("gpt-5")');
  const count = await gptButton.count();
  console.log(`Found ${count} buttons with text "gpt-5"`);

  if (count > 0) {
    console.log('Clicking gpt-5 button...');
    await gptButton.first().click();
    await page.waitForTimeout(2000);

    // Take screenshot
    await page.screenshot({ path: '/tmp/debug-model-dropdown.png', fullPage: true });
    console.log('📸 Screenshot saved: /tmp/debug-model-dropdown.png');

    // List all visible text options
    const options = await page.locator('[role="option"]').all();
    console.log(`\nFound ${options.length} options:`);
    for (let i = 0; i < options.length; i++) {
      const text = await options[i].innerText().catch(() => '');
      console.log(`  Option ${i}: "${text}"`);
    }

    // Look for any menu items
    const menuItems = await page.locator('[role="menuitem"]').all();
    console.log(`\nFound ${menuItems.length} menu items:`);
    for (let i = 0; i < menuItems.length; i++) {
      const text = await menuItems[i].innerText().catch(() => '');
      console.log(`  Menu item ${i}: "${text}"`);
    }

    // Look for anything clickable with "Agent"
    const agentLinks = await page.locator('a:has-text("Agents"), button:has-text("Agents"), [role="option"]:has-text("Agents")').all();
    console.log(`\nFound ${agentLinks.length} clickable elements with "Agents":`);
    for (let i = 0; i < agentLinks.length; i++) {
      const text = await agentLinks[i].innerText().catch(() => '');
      const tagName = await agentLinks[i].evaluate(el => el.tagName);
      console.log(`  ${tagName} ${i}: "${text}"`);
    }
  }

  await page.waitForTimeout(5000);
});
