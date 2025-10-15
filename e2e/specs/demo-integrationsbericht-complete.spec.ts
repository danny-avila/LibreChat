import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Complete E2E test for Integrationsbericht Demo
 * Tests Steps 1-6 of the demo workflow with the KI-Referent agent
 *
 * Prerequisites:
 * - LibreChat running at http://localhost:3080
 * - HIVE API running at http://localhost:8000
 * - KI-Referent system agent created
 * - Demo user: sales-demo@senticor.de exists
 */

const BASE_URL = 'http://localhost:3080';
const DEMO_USER = {
  email: 'sales-demo@senticor.de',
  password: 'SalesDemo2025!Secure',
};

async function loginUser(page: Page) {
  console.log('🔐 Logging in...');
  await page.goto(`${BASE_URL}/login`, { timeout: 15000 });
  await page.fill('input[name="email"]', DEMO_USER.email);
  await page.fill('input[name="password"]', DEMO_USER.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/c\//, { timeout: 15000 });
  console.log('✅ Logged in successfully');
}

async function selectKIReferentAgent(page: Page) {
  console.log('🤖 Selecting KI-Referent agent...');

  // Click model selector button (shows current model like "gpt-5" or "KI-Referent")
  const modelButton = page.locator('button:has-text("gpt"), button:has-text("GPT"), button:has-text("KI-Referent"), button[id^=":r"]').first();
  await modelButton.waitFor({ state: 'visible', timeout: 10000 });
  await modelButton.click();
  await page.waitForTimeout(1000);

  // Look for "My Agents" in the dropdown
  const myAgentsOption = page.getByText('My Agents', { exact: true });
  if (await myAgentsOption.count() > 0) {
    await myAgentsOption.click();
    console.log('  → Opened My Agents');
    await page.waitForTimeout(1500);
  }

  // Now we should see agent selection - look for KI-Referent
  const kiReferentOption = page.getByText('KI-Referent', { exact: true });
  const kiReferentCount = await kiReferentOption.count();

  console.log(`  → Found ${kiReferentCount} KI-Referent options`);

  if (kiReferentCount > 0) {
    // Click the first KI-Referent (should be in agent list)
    await kiReferentOption.first().click({ timeout: 5000 });
    console.log('✅ Selected KI-Referent agent');
    await page.waitForTimeout(1500);
  } else {
    // Take screenshot for debugging
    await page.screenshot({ path: '/tmp/agent-list-debug.png' });
    throw new Error('KI-Referent agent not found. Check /tmp/agent-list-debug.png');
  }
}

async function sendMessageAndWait(page: Page, message: string, options: {
  waitForResponse?: boolean;
  timeout?: number;
  checkContent?: string | RegExp;
} = {}) {
  const {
    waitForResponse = true,
    timeout = 180000, // 3 minutes for AI responses
    checkContent
  } = options;

  console.log(`📤 Sending: ${message.substring(0, 80)}${message.length > 80 ? '...' : ''}`);

  const textbox = page.locator('form textarea, form input[type="text"]').first();
  await textbox.waitFor({ state: 'visible', timeout: 10000 });
  await textbox.click();
  await textbox.fill(message);
  await textbox.press('Enter');

  if (!waitForResponse) {
    return;
  }

  // Wait for AI to start responding (Stop button appears)
  console.log('  ⏳ Waiting for AI response...');
  try {
    await page.waitForSelector('button:has-text("Stop")', { state: 'visible', timeout: 30000 });
    console.log('  → AI is responding...');

    // Wait for response to complete (Stop button disappears)
    await page.waitForSelector('button:has-text("Stop")', { state: 'detached', timeout });
    console.log('  ✅ Response received');
  } catch (error) {
    console.log('  ⚠️  No Stop button detected, checking for response...');
  }

  await page.waitForTimeout(2000);

  // Check for specific content if requested
  if (checkContent) {
    const messages = page.locator('[class*="markdown"], [data-testid*="message"]');
    const lastMessage = messages.last();
    await expect(lastMessage).toContainText(checkContent, { timeout: 10000 });
    console.log(`  ✓ Response contains: "${checkContent}"`);
  }
}

test.describe('Integrationsbericht Demo - Complete Workflow', () => {
  test.setTimeout(600000); // 10 minutes for full workflow

  test('Complete Demo: Steps 1-6', async ({ page }) => {
    // Setup: Login and select agent
    await loginUser(page);
    await page.goto(`${BASE_URL}/c/new`, { timeout: 10000 });
    await page.waitForTimeout(1000);
    await selectKIReferentAgent(page);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📝 STEP 1: Projekt starten & Honeycomb erstellen');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await sendMessageAndWait(page,
      'Ich erstelle den Integrationsbericht Baden-Württemberg 2025 für die Veröffentlichung im Q1 2026. ' +
      'Das Kernstück ist ein Update zu 34 lokalen Integrationsprojekten. ' +
      'Hier ist die Pressemitteilung:\n\n' +
      'https://sozialministerium.baden-wuerttemberg.de/de/service/presse/pressemitteilung/pid/land-foerdert-34-lokale-integrationsprojekte-mit-rund-18-millionen-euro',
      {
        timeout: 240000, // 4 minutes for this complex operation
        checkContent: /honeycomb|wissensgraph|erstellt/i
      }
    );

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🌐 STEP 2: Pressemitteilung einlesen');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // The agent should have already created a honeycomb in Step 1
    // Now we ask it to add more information
    await sendMessageAndWait(page,
      'Ja, bitte erstelle den Honeycomb und füge die Informationen aus der Pressemitteilung hinzu.',
      {
        timeout: 180000, // 3 minutes
      }
    );

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⚖️  STEP 3: Rechtliche Grundlagen');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await sendMessageAndWait(page,
      'Welche Gesetze regeln Integration in Baden-Württemberg? ' +
      'Ich brauche die rechtliche Grundlage für Kapitel 2 des Berichts. ' +
      'Bitte füge die wichtigsten Paragraphen zum Honeycomb hinzu.',
      {
        timeout: 180000,
        checkContent: /§|gesetz|aufenthg|sgb/i
      }
    );

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 STEP 4: Projekt-Tracking-Struktur');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await sendMessageAndWait(page,
      'Bis Q1 2026 muss ich für jedes Projekt dokumentieren:\n' +
      '- Zielerreichung und Kennzahlen\n' +
      '- Herausforderungen\n' +
      '- Best Practices\n\n' +
      'Wie strukturiere ich das am besten im Honeycomb?',
      {
        timeout: 120000,
        checkContent: /struktur|entit|eigenschaften|template/i
      }
    );

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 STEP 5: Berichtsgliederung');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await sendMessageAndWait(page,
      'Erstelle eine Gliederung für den Integrationsbericht basierend auf den Daten im Honeycomb. ' +
      'Der Bericht sollte die 34 Projekte, rechtlichen Grundlagen und Best Practices enthalten.',
      {
        timeout: 120000,
        checkContent: /kapitel|gliederung|1\.|2\.|einleitung|zusammenfassung/i
      }
    );

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 STEP 6: Suche & Analyse');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await sendMessageAndWait(page,
      'Zeige mir alle Entitäten im Honeycomb. Wie viele Projekte sind erfasst?',
      {
        timeout: 60000,
        checkContent: /entit|projekt|honeycomb/i
      }
    );

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ COMPLETE: All 6 steps executed successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Final verification - check conversation has messages
    const messages = page.locator('[class*="markdown"], [data-testid*="message"]');
    const messageCount = await messages.count();
    console.log(`📊 Total messages in conversation: ${messageCount}`);
    expect(messageCount).toBeGreaterThan(10); // Should have user + assistant messages for all steps
  });

  test('Step 1 Only: Create Honeycomb', async ({ page }) => {
    test.setTimeout(180000); // 3 minutes

    await loginUser(page);
    await page.goto(`${BASE_URL}/c/new`, { timeout: 10000 });
    await page.waitForTimeout(1000);
    await selectKIReferentAgent(page);

    console.log('\n📝 Testing Step 1: Honeycomb creation\n');

    await sendMessageAndWait(page,
      'Ich erstelle den Integrationsbericht Baden-Württemberg 2025.',
      {
        timeout: 120000,
        checkContent: /honeycomb|wissensgraph/i
      }
    );

    console.log('✅ Step 1 test complete');
  });

  test('Legal Research: Step 3', async ({ page }) => {
    test.setTimeout(180000); // 3 minutes

    await loginUser(page);
    await page.goto(`${BASE_URL}/c/new`, { timeout: 10000 });
    await page.waitForTimeout(1000);
    await selectKIReferentAgent(page);

    console.log('\n⚖️  Testing Step 3: Legal research\n');

    await sendMessageAndWait(page,
      'Welche Gesetze regeln Integration in Deutschland? Nenne mir die wichtigsten Paragraphen.',
      {
        timeout: 120000,
        checkContent: /§|gesetz|aufenthg|sgb|integration/i
      }
    );

    console.log('✅ Step 3 test complete');
  });
});
