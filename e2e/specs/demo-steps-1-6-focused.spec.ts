import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Focused E2E test for Demo Steps 1-6
 * Tests the core Integrationsbericht workflow
 * Runs headless by default, uses existing LibreChat + HIVE
 */

const { DEMO_USER } = require('../test-user');
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3080';

async function loginUser(page: Page) {
  await page.goto(`${BASE_URL}/login`, { timeout: 10000 });
  await page.fill('input[name="email"]', DEMO_USER.email);
  await page.fill('input[name="password"]', DEMO_USER.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/c\//, { timeout: 10000 });
  console.log('✅ Logged in');
}

async function selectAgentsEndpoint(page: Page) {
  // The model/endpoint selector is in the header area with text like "gpt-5"
  // It's inside a button that opens the endpoint selection dropdown
  // Look for button with the model name or ID pattern (":r1a:" etc)
  const modelButtons = page.locator('button:has-text("gpt"), button:has-text("GPT"), button[id^=":r"]');
  const count = await modelButtons.count();
  console.log(`Found ${count} potential model selector buttons`);

  // Click the first one that looks like a model selector (usually in top center of page)
  if (count > 0) {
    await modelButtons.first().click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: '/tmp/model-dropdown.png' });
    console.log('📸 Model dropdown screenshot saved to /tmp/model-dropdown.png');
  } else {
    throw new Error('Could not find model selector button');
  }

  // Now look for "My Agents" or "StackIT Agents" in the dropdown
  const myAgentsOption = page.getByText('My Agents', { exact: true });
  const stackitOption = page.getByText('StackIT Agents');

  // Try My Agents first
  if (await myAgentsOption.count() > 0) {
    await myAgentsOption.click({ timeout: 5000 });
    console.log('✅ Selected My Agents');
  } else if (await stackitOption.count() > 0) {
    await stackitOption.click({ timeout: 5000 });
    console.log('✅ Selected StackIT Agents');
  } else {
    throw new Error('Could not find Agents option in dropdown');
  }

  await page.waitForTimeout(1000);
}

async function sendMessage(page: Page, message: string, waitForContent?: string | RegExp) {
  const textbox = page.locator('form').getByRole('textbox');
  await textbox.click();
  await textbox.fill(message);
  await textbox.press('Enter');

  console.log(`📤 Sent: ${message.substring(0, 60)}...`);

  // Wait for response to appear
  await page.waitForTimeout(2000);

  // Wait for stop button to disappear (response complete)
  try {
    await page.waitForSelector('button:has-text("Stop")', { state: 'visible', timeout: 5000 });
    await page.waitForSelector('button:has-text("Stop")', { state: 'detached', timeout: 120000 });
  } catch {
    // No stop button or already complete
  }

  await page.waitForTimeout(1000);

  if (waitForContent) {
    const lastMessage = page.locator('[data-testid="message-content"]').last();
    await expect(lastMessage).toContainText(waitForContent, { timeout: 10000 });
    console.log(`✅ Response contains: ${waitForContent}`);
  } else {
    console.log('✅ Response received');
  }
}

test.describe('Demo Steps 1-6: Integrationsbericht Workflow', () => {
  test.beforeEach(async ({ page }) => {
    // Login fresh for each test (storage state isn't working reliably)
    await loginUser(page);

    // Navigate to new conversation
    await page.goto(`${BASE_URL}/c/new`, { timeout: 10000 });
    await page.waitForTimeout(1000);
  });

  test('Step 1: Create honeycomb for Integrationsbericht', async ({ page }) => {
    test.setTimeout(120000);

    console.log('\n📝 STEP 1: Projekt starten & Honeycomb erstellen\n');

    await selectAgentsEndpoint(page);

    const message =
      'Ich erstelle den Integrationsbericht Baden-Württemberg 2025 für die ' +
      'Veröffentlichung im Q1 2026. Das Kernstück ist ein Update zu 34 lokalen ' +
      'Integrationsprojekten. Hier ist die Pressemitteilung:\n\n' +
      'https://sozialministerium.baden-wuerttemberg.de/de/service/presse/pressemitteilung/pid/land-foerdert-34-lokale-integrationsprojekte-mit-rund-18-millionen-euro';

    await sendMessage(page, message, /honeycomb|wissensgraph/i);

    console.log('✅ Step 1 Complete\n');
  });

  test('Step 2: Fetch press release and extract projects', async ({ page }) => {
    test.setTimeout(180000);

    console.log('\n🌐 STEP 2: Pressemitteilung einlesen\n');

    await selectAgentsEndpoint(page);

    // First create honeycomb
    await sendMessage(
      page,
      'Erstelle einen Honeycomb für Integrationsbericht Baden-Württemberg 2025'
    );

    await page.waitForTimeout(2000);

    // Then fetch and process
    const fetchMessage =
      'Lies diese Pressemitteilung und füge die Projekte zum Honeycomb hinzu:\n' +
      'https://sozialministerium.baden-wuerttemberg.de/de/service/presse/pressemitteilung/pid/land-foerdert-34-lokale-integrationsprojekte-mit-rund-18-millionen-euro';

    await sendMessage(page, fetchMessage, /projekt|ministerium/i);

    console.log('✅ Step 2 Complete\n');
  });

  test('Step 3: Search and add legal paragraphs', async ({ page }) => {
    test.setTimeout(180000);

    console.log('\n⚖️  STEP 3: Rechtliche Grundlagen recherchieren\n');

    await selectAgentsEndpoint(page);

    // Create honeycomb first
    await sendMessage(page, 'Erstelle einen Honeycomb für Integrationsrecht');
    await page.waitForTimeout(2000);

    // Search laws
    const legalMessage =
      'Welche Gesetze regeln Integration in Baden-Württemberg? ' +
      'Ich brauche die rechtliche Grundlage für Kapitel 2 des Berichts.';

    await sendMessage(page, legalMessage, /SGB|AufenthG|IntG/i);

    console.log('✅ Step 3 Complete\n');
  });

  test('Step 4: Create project tracking structure', async ({ page }) => {
    test.setTimeout(120000);

    console.log('\n📊 STEP 4: Projekt-Tracking-Struktur\n');

    await selectAgentsEndpoint(page);

    await sendMessage(page, 'Erstelle einen Honeycomb für Projekttracking');
    await page.waitForTimeout(2000);

    const trackingMessage =
      'Bis Q1 2026 muss ich für jedes Projekt dokumentieren:\n' +
      '- Zielerreichung und Kennzahlen\n' +
      '- Herausforderungen\n' +
      '- Best Practices\n\n' +
      'Wie strukturiere ich das am besten im Honeycomb?';

    await sendMessage(page, trackingMessage, /struktur|tracking|entit/i);

    console.log('✅ Step 4 Complete\n');
  });

  test('Step 5: Generate report outline', async ({ page }) => {
    test.setTimeout(120000);

    console.log('\n📋 STEP 5: Berichtsgliederung generieren\n');

    await selectAgentsEndpoint(page);

    // Setup: Create honeycomb with some data
    await sendMessage(page, 'Erstelle einen Honeycomb mit Beispielprojekten');
    await page.waitForTimeout(2000);

    const outlineMessage =
      'Erstelle eine Gliederung für den Integrationsbericht basierend auf ' +
      'den Daten im Honeycomb.';

    await sendMessage(page, outlineMessage, /gliederung|kapitel|chapter/i);

    console.log('✅ Step 5 Complete\n');
  });

  test('Step 6: Search and analyze honeycomb', async ({ page }) => {
    test.setTimeout(120000);

    console.log('\n🔍 STEP 6: Suche & Analyse\n');

    await selectAgentsEndpoint(page);

    // Setup: Create honeycomb
    await sendMessage(page, 'Erstelle einen Test-Honeycomb mit Projekten');
    await page.waitForTimeout(2000);

    // Search
    const searchMessage = 'Zeige mir alle Entitäten im Honeycomb.';
    await sendMessage(page, searchMessage, /entit|entity|honeycomb/i);

    console.log('✅ Step 6 Complete\n');
  });

  test('Complete Flow: Steps 1-6 in sequence', async ({ page }) => {
    test.setTimeout(600000); // 10 minutes

    console.log('\n🎬 COMPLETE DEMO FLOW: Steps 1-6\n');

    await selectAgentsEndpoint(page);

    // STEP 1
    console.log('━━━ Step 1: Create Honeycomb ━━━');
    await sendMessage(
      page,
      'Ich erstelle den Integrationsbericht Baden-Württemberg 2025. ' +
        'Das Kernstück ist ein Update zu 34 Integrationsprojekten.',
      /honeycomb|wissensgraph/i
    );

    // STEP 2
    console.log('\n━━━ Step 2: Fetch Press Release ━━━');
    await sendMessage(
      page,
      'Ja, erstelle den Honeycomb und lies dann diese Pressemitteilung:\n' +
        'https://sozialministerium.baden-wuerttemberg.de/de/service/presse/pressemitteilung/pid/land-foerdert-34-lokale-integrationsprojekte-mit-rund-18-millionen-euro'
    );

    // STEP 3
    console.log('\n━━━ Step 3: Legal Research ━━━');
    await sendMessage(
      page,
      'Welche Gesetze regeln Integration? Füge die wichtigsten Paragraphen zum Honeycomb hinzu.',
      /SGB|AufenthG/i
    );

    // STEP 4
    console.log('\n━━━ Step 4: Project Tracking ━━━');
    await sendMessage(
      page,
      'Wie strukturiere ich Projekt-Tracking mit Kennzahlen und Best Practices?',
      /struktur|tracking/i
    );

    // STEP 5
    console.log('\n━━━ Step 5: Report Outline ━━━');
    await sendMessage(
      page,
      'Erstelle eine Gliederung für den Bericht basierend auf den Daten.',
      /gliederung|kapitel/i
    );

    // STEP 6
    console.log('\n━━━ Step 6: Search & Analyze ━━━');
    await sendMessage(
      page,
      'Finde alle Projekte im Honeycomb, die sich mit Ehrenamt beschäftigen.',
      /projekt|ehrenamt/i
    );

    console.log('\n✅ Complete Flow: All 6 steps executed successfully!\n');
  });
});
