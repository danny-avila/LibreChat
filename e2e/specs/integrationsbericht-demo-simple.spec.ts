import { expect, test, chromium } from '@playwright/test';
import type { Browser, Page, BrowserContext } from '@playwright/test';

/**
 * Simple E2E test for Integrationsbericht Demo
 * Runs against deployed Podman container (http://localhost:3080)
 * No build required - just tests the live system
 */

const BASE_URL = 'http://localhost:3080';
const TIMEOUT = 120000; // 2 minutes per test

// Dedicated test user for Integrationsbericht demo
const TEST_USER = {
  email: 'demo-integration@test.local',
  name: 'Demo Integration User',
  password: 'DemoIntegration2025!',
};

async function loginUser(page: Page) {
  await page.goto(`${BASE_URL}/login`);

  // Fill in credentials
  await page.fill('input[name="email"]', TEST_USER.email);
  await page.fill('input[name="password"]', TEST_USER.password);

  // Click login button
  await page.click('button[type="submit"]');

  // Handle Terms of Service modal if it appears
  try {
    const tosAcceptButton = page.locator('button:has-text("Accept"), button:has-text("Akzeptieren"), button:has-text("I Agree")');
    await tosAcceptButton.click({ timeout: 5000 });
    console.log('✅ Accepted ToS modal');
  } catch {
    // No ToS modal, continue
  }

  // Wait for redirect to main page
  await page.waitForURL(/\/c\//, { timeout: 10000 });
}

async function registerUser(page: Page) {
  await page.goto(`${BASE_URL}/register`);

  // Fill in registration form
  await page.fill('input[name="name"]', TEST_USER.name);
  await page.fill('input[name="email"]', TEST_USER.email);
  await page.fill('input[name="password"]', TEST_USER.password);
  await page.fill('input[name="confirm_password"]', TEST_USER.password);

  // Submit registration
  await page.click('button[type="submit"]');

  // Wait for redirect to login or main page
  await page.waitForTimeout(2000);
}

test.describe('Integrationsbericht BW 2025 Demo - Live System', () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async () => {
    browser = await chromium.launch({
      headless: false, // Show browser for demo verification
      slowMo: 500, // Slow down for visibility
    });

    // Create a persistent context for the test user
    context = await browser.newContext();
    page = await context.newPage();

    // Try to login, if fails, register user first
    try {
      await loginUser(page);
      console.log('✅ Logged in as existing test user');
    } catch (error) {
      console.log('⚠️  User does not exist, registering...');
      try {
        await registerUser(page);
        await loginUser(page);
        console.log('✅ Registered and logged in as new test user');
      } catch (regError) {
        console.error('❌ Failed to register/login:', regError);
        throw regError;
      }
    }
  });

  test.afterAll(async () => {
    await context.close();
    await browser.close();
  });

  test.beforeEach(async () => {
    // Navigate to new conversation for each test
    await page.goto(`${BASE_URL}/c/new`);
  });

  test.afterEach(async () => {
    // Don't close page, we reuse it in beforeAll
  });

  test('Can access LibreChat and Agents endpoint exists', async () => {
    test.setTimeout(30000);

    // Check if we're on LibreChat
    await expect(page).toHaveTitle(/LibreChat/i);

    // Check if we can access the new conversation menu
    const newConvoButton = page.locator('#new-conversation-menu');
    await expect(newConvoButton).toBeVisible({ timeout: 10000 });

    // Click to open endpoint selection
    await newConvoButton.click();

    // Verify Agents endpoint exists
    const agentsEndpoint = page.locator('#agents');
    await expect(agentsEndpoint).toBeVisible({ timeout: 5000 });

    console.log('✅ LibreChat accessible, Agents endpoint available');
  });

  test('Can select Agents endpoint and send message', async () => {
    test.setTimeout(TIMEOUT);

    // Select Agents endpoint
    await page.locator('#new-conversation-menu').click();
    await page.locator('#agents').click();

    // Wait for textbox to be ready
    const textbox = page.locator('form').getByRole('textbox');
    await expect(textbox).toBeVisible({ timeout: 10000 });

    // Send a simple test message
    await textbox.click();
    await textbox.fill('Hallo, bist du bereit für eine Demo?');
    await textbox.press('Enter');

    // Wait for response to start (look for stop button or message)
    await page.waitForTimeout(2000);

    // Check if there's a response message
    const messages = page.locator('[data-testid="message-content"]');
    await expect(messages).toHaveCount(2, { timeout: 60000 }); // User message + AI response

    console.log('✅ Can send and receive messages via Agents endpoint');
  });

  test('Honeycomb MCP server is available', async () => {
    test.setTimeout(TIMEOUT);

    await page.locator('#new-conversation-menu').click();
    await page.locator('#agents').click();

    const textbox = page.locator('form').getByRole('textbox');
    await textbox.click();
    await textbox.fill('Welche MCP-Tools hast du verfügbar? Liste alle honeycomb-Tools auf.');
    await textbox.press('Enter');

    // Wait for response
    await page.waitForTimeout(5000);

    // Check if response mentions honeycomb tools
    const lastMessage = page.locator('[data-testid="message-content"]').last();
    await expect(lastMessage).toContainText(/honeycomb|create_honeycomb|add_entity/i, {
      timeout: 60000,
    });

    console.log('✅ Honeycomb MCP server is available');
  });

  test('Fetch MCP server can read URLs', async () => {
    test.setTimeout(TIMEOUT);

    await page.locator('#new-conversation-menu').click();
    await page.locator('#agents').click();

    const textbox = page.locator('form').getByRole('textbox');
    await textbox.click();
    await textbox.fill('Lies diese Webseite: https://example.com und sage mir, was du siehst.');
    await textbox.press('Enter');

    // Wait for response
    await page.waitForTimeout(10000);

    // Check if response indicates it read the page
    const lastMessage = page.locator('[data-testid="message-content"]').last();
    await expect(lastMessage).toContainText(/example|domain|website|illustration/i, {
      timeout: 60000,
    });

    console.log('✅ Fetch MCP server can read URLs');
  });

  test('Rechtsinformationen MCP server can search laws', async () => {
    test.setTimeout(TIMEOUT);

    await page.locator('#new-conversation-menu').click();
    await page.locator('#agents').click();

    const textbox = page.locator('form').getByRole('textbox');
    await textbox.click();
    await textbox.fill('Suche nach Integrationsgesetzen in Deutschland.');
    await textbox.press('Enter');

    // Wait for response
    await page.waitForTimeout(10000);

    // Check if response mentions relevant laws
    const lastMessage = page.locator('[data-testid="message-content"]').last();
    await expect(lastMessage).toContainText(/SGB|AufenthG|IntG|Gesetz/i, {
      timeout: 60000,
    });

    console.log('✅ Rechtsinformationen MCP server can search laws');
  });

  test('Proactive honeycomb suggestion works', async () => {
    test.setTimeout(TIMEOUT);

    await page.locator('#new-conversation-menu').click();
    await page.locator('#agents').click();

    const textbox = page.locator('form').getByRole('textbox');
    await textbox.click();

    // Complex task that should trigger honeycomb suggestion
    await textbox.fill(
      'Ich muss 50 wissenschaftliche Paper organisieren mit Autoren, Zitaten und Keywords.'
    );
    await textbox.press('Enter');

    // Wait for response
    await page.waitForTimeout(10000);

    // Check if AI suggests honeycomb
    const lastMessage = page.locator('[data-testid="message-content"]').last();
    await expect(lastMessage).toContainText(/honeycomb|wissensgraph|knowledge.*graph/i, {
      timeout: 60000,
    });

    console.log('✅ Proactive honeycomb suggestion works');
  });

  test('Demo Step 1: Project start triggers honeycomb creation', async () => {
    test.setTimeout(TIMEOUT);

    await page.locator('#new-conversation-menu').click();
    await page.locator('#agents').click();

    const textbox = page.locator('form').getByRole('textbox');
    await textbox.click();

    const demoMessage =
      'Ich erstelle den Integrationsbericht Baden-Württemberg 2025 für die Veröffentlichung im Q1 2026. ' +
      'Das Kernstück ist ein Update zu 34 lokalen Integrationsprojekten.';

    await textbox.fill(demoMessage);
    await textbox.press('Enter');

    // Wait for response suggesting honeycomb
    await page.waitForTimeout(15000);

    const lastMessage = page.locator('[data-testid="message-content"]').last();
    await expect(lastMessage).toContainText(/honeycomb|wissensgraph/i, { timeout: 60000 });

    console.log('✅ Demo Step 1: Honeycomb suggestion works');
  });
});
