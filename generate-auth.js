// Generate E2E authentication storage state automatically
const { chromium } = require('@playwright/test');
const path = require('path');

const user = {
  email: 'sales-demo@senticor.de',
  password: 'SalesDemo2025!Secure'
};

async function generateAuth() {
  console.log('🔐 Generating E2E authentication...');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigate to login
    console.log('📍 Navigating to login page...');
    await page.goto('http://localhost:3080/login', { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Fill login form
    console.log('✍️  Filling login form...');
    await page.fill('input[name="email"]', user.email);
    await page.fill('input[name="password"]', user.password);

    // Submit
    console.log('🚀 Submitting login...');
    await page.click('button[type="submit"]');

    // Wait a bit for any error messages or navigation
    await page.waitForTimeout(3000);

    // Check for errors
    const errorMsg = await page.locator('.error, [role="alert"], .text-red-500').first().textContent().catch(() => null);
    if (errorMsg) {
      console.log('⚠️  Error message on page:', errorMsg);
    }

    // Wait for navigation to chat
    try {
      await page.waitForURL(/\/c\//, { timeout: 30000 });
      console.log('✅ Login successful!');
    } catch (e) {
      console.log('⚠️  Did not navigate to /c/ - checking current URL...');
      console.log('   Current URL:', page.url());

      // Take screenshot for debugging
      await page.screenshot({ path: 'login-debug.png' });
      console.log('   Screenshot saved to login-debug.png');
      throw e;
    }

    // Handle ToS if it appears
    try {
      const tosButton = page.locator('button:has-text("Accept"), button:has-text("Akzeptieren"), button:has-text("I Agree")');
      await tosButton.click({ timeout: 3000 });
      console.log('✅ ToS accepted');
    } catch {
      console.log('ℹ️  No ToS dialog');
    }

    // Save storage state
    const storagePath = path.resolve(__dirname, 'e2e/storageState.json');
    await context.storageState({ path: storagePath });

    console.log(`💾 Storage state saved to: ${storagePath}`);
    console.log('✅ Authentication complete!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

generateAuth();
