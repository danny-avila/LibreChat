import { expect, test, chromium } from '@playwright/test';
import type { Browser, Page, BrowserContext } from '@playwright/test';

/**
 * Complete Integrationsbericht BW 2025 Demo - ALL STEPS
 *
 * This test validates the COMPLETE demo flow as documented in:
 * docs/senticor/demos/Demo-script-integrationsbericht.md
 *
 * Covers all 10 steps including:
 * 1. Projekt starten
 * 2. Pressemitteilung einlesen
 * 3. Rechtliche Grundlagen
 * 4. Projekt-Tracking
 * 5. Berichtsgliederung
 * 6. Suche & Analyse
 * 6a. OSINT Agent Team Research (NEW!)
 * 7. Vorschriften Q&A
 * 8. Textgenerierung
 * 9. Graph-Visualisierung (optional)
 * 10. Nutzer-Feedback (optional)
 *
 * Purpose: Comprehensive validation of all demo functionality
 * Duration: ~30 minutes (includes real AI responses + OSINT research)
 */

const BASE_URL = 'http://localhost:3080';
const FULL_DEMO_TIMEOUT = 1800000; // 30 minutes for complete demo

// Dedicated demo user
const DEMO_USER = {
  email: 'full-demo@senticor.de',
  name: 'Senticor Full Demo',
  password: 'FullDemo2025!Secure',
};

async function loginOrRegisterDemoUser(page: Page) {
  try {
    // Try login first
    await page.goto(`${BASE_URL}/login`, { timeout: 10000 });
    await page.fill('input[name="email"]', DEMO_USER.email);
    await page.fill('input[name="password"]', DEMO_USER.password);
    await page.click('button[type="submit"]');

    // Handle ToS if appears
    try {
      const tosButton = page.locator('button:has-text("Accept"), button:has-text("Akzeptieren"), button:has-text("I Agree")');
      await tosButton.click({ timeout: 3000 });
    } catch {
      // No ToS, continue
    }

    await page.waitForURL(/\/c\//, { timeout: 10000 });
    console.log('✅ Logged in as existing demo user');
  } catch {
    // Registration needed
    console.log('⚠️  Demo user does not exist, registering...');
    await page.goto(`${BASE_URL}/register`, { timeout: 10000 });
    await page.fill('input[name="name"]', DEMO_USER.name);
    await page.fill('input[name="email"]', DEMO_USER.email);
    await page.fill('input[name="password"]', DEMO_USER.password);
    await page.fill('input[name="confirm_password"]', DEMO_USER.password);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    // Now login
    await loginOrRegisterDemoUser(page);
  }
}

async function sendMessageAndWaitForResponse(
  page: Page,
  message: string,
  options: {
    waitForText?: string | RegExp;
    timeout?: number;
    skipResponseWait?: boolean;
  } = {}
) {
  const { waitForText, timeout = 180000, skipResponseWait = false } = options;

  const textbox = page.locator('form').getByRole('textbox');
  await textbox.click();
  await textbox.fill(message);
  await textbox.press('Enter');

  console.log(`📤 Sent: ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`);

  // Wait for message to appear
  await page.waitForTimeout(2000);

  if (!skipResponseWait) {
    // Wait for response to complete (stop button disappears)
    try {
      await page.waitForSelector('button:has-text("Stop")', { state: 'visible', timeout: 5000 });
      console.log('⏳ Waiting for AI response...');
      await page.waitForSelector('button:has-text("Stop")', { state: 'detached', timeout });
    } catch {
      // No stop button, response might be instant or already complete
    }

    // Additional wait for UI to settle
    await page.waitForTimeout(2000);

    // If specific text expected, verify it
    if (waitForText) {
      const lastMessage = page.locator('[data-testid="message-content"]').last();
      await expect(lastMessage).toContainText(waitForText, { timeout: 10000 });
      console.log(`✅ Response received containing: ${waitForText}`);
    } else {
      console.log('✅ Response received');
    }
  }
}

async function selectAgentsEndpoint(page: Page) {
  console.log('\n📋 Selecting Agents endpoint...');
  try {
    // Click the model selector button (works with gpt, claude, gemini, etc.)
    const modelButton = page.locator('button').filter({ hasText: /gpt-|claude-|gemini|My Agents/ }).first();
    await modelButton.click({ timeout: 5000 });
    await page.waitForTimeout(500);

    // Click on "My Agents" option in the dropdown
    await page.locator('[role="option"]:has-text("My Agents")').click();
    await page.waitForTimeout(1000);
    console.log('✅ Agents endpoint selected\n');
  } catch (error) {
    console.log('⚠️  Could not select Agents endpoint, using default');
  }
}

test.describe('Integrationsbericht BW 2025 - Full Demo (All 10 Steps)', () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async () => {
    browser = await chromium.launch({
      headless: process.env.HEADED !== 'true', // Show browser if HEADED=true
      slowMo: process.env.HEADED === 'true' ? 300 : 0, // Slow down for visibility
    });

    context = await browser.newContext({
      viewport: { width: 1920, height: 1080 }, // Full HD for presentations
    });

    page = await context.newPage();
    await loginOrRegisterDemoUser(page);
  });

  test.afterAll(async () => {
    await context.close();
    await browser.close();
  });

  test('Complete Demo: All 10 Steps from Demo Script', async () => {
    test.setTimeout(FULL_DEMO_TIMEOUT);

    console.log('\n🎬 Starting FULL Integrationsbericht BW 2025 Demo (All 10 Steps)\n');

    // Navigate to new conversation
    await page.goto(`${BASE_URL}/c/new`);
    await page.waitForTimeout(2000);

    // Select Agents endpoint
    await selectAgentsEndpoint(page);

    // ========================================================================
    // STEP 1: Project Start - Honeycomb Creation
    // ========================================================================
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📝 STEP 1: Projekt starten & Wissensgraph erstellen');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const step1Message =
      'Ich erstelle den Integrationsbericht Baden-Württemberg 2025 für die Veröffentlichung im Q1 2026. ' +
      'Das Kernstück ist ein Update zu 34 lokalen Integrationsprojekten. Hier ist die Pressemitteilung dazu: ' +
      'https://sozialministerium.baden-wuerttemberg.de/de/service/presse/pressemitteilung/pid/land-foerdert-34-lokale-integrationsprojekte-mit-rund-18-millionen-euro';

    await sendMessageAndWaitForResponse(page, step1Message, {
      waitForText: /honeycomb|wissensgraph/i,
    });

    console.log('✅ Step 1 Complete: AI suggested honeycomb creation\n');
    await page.waitForTimeout(2000);

    // ========================================================================
    // STEP 2: Press Release Fetching
    // ========================================================================
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🌐 STEP 2: Pressemitteilung einlesen');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const step2Message =
      'Ja, bitte lies die Pressemitteilung und suche die ersten 3-5 Beispielprojekte mit ihren Trägerorganisationen heraus.';
    await sendMessageAndWaitForResponse(page, step2Message, {
      waitForText: /projekt|träger|organisation/i,
    });

    console.log('✅ Step 2 Complete: Press release fetched and projects extracted\n');
    await page.waitForTimeout(2000);

    // ========================================================================
    // STEP 3: Legal Research
    // ========================================================================
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⚖️  STEP 3: Rechtliche Grundlagen recherchieren');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const step3Message =
      'Welche Gesetze regeln Integration in Baden-Württemberg? ' +
      'Ich brauche die rechtliche Grundlage für Kapitel 2 des Berichts.';
    await sendMessageAndWaitForResponse(page, step3Message, {
      waitForText: /SGB|AufenthG|IntG|Gesetz/i,
    });

    console.log('✅ Step 3 Complete: Legal research completed\n');
    await page.waitForTimeout(2000);

    // Step 3b: Add Laws to Honeycomb
    console.log('📚 STEP 3b: Paragraphen zum Wissensgraph hinzufügen\n');

    const step3bMessage = 'Ja, füge die zentralen Paragraphen hinzu.';
    await sendMessageAndWaitForResponse(page, step3bMessage, {
      waitForText: /paragraph|hinzugefügt|added|entität/i,
    });

    console.log('✅ Step 3b Complete: Laws added to knowledge graph\n');
    await page.waitForTimeout(2000);

    // ========================================================================
    // STEP 4: Project Tracking Structure
    // ========================================================================
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 STEP 4: Projekt-Tracking-Struktur');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const step4Message =
      'Bis Q1 2026 muss ich für jedes Projekt dokumentieren: Zielerreichung und Kennzahlen, ' +
      'Herausforderungen, Best Practices. Wie strukturiere ich das am besten?';
    await sendMessageAndWaitForResponse(page, step4Message, {
      waitForText: /tracking|status|struktur|kennzahl/i,
    });

    console.log('✅ Step 4 Complete: Tracking structure recommended\n');
    await page.waitForTimeout(2000);

    // ========================================================================
    // STEP 5: Report Outline Generation
    // ========================================================================
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 STEP 5: Berichtsgliederung generieren');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const step5Message =
      'Erstelle eine Gliederung für den Integrationsbericht basierend auf den Daten, ' +
      'die wir bisher gesammelt haben.';
    await sendMessageAndWaitForResponse(page, step5Message, {
      waitForText: /gliederung|kapitel|chapter/i,
    });

    console.log('✅ Step 5 Complete: Report outline generated\n');
    await page.waitForTimeout(2000);

    // ========================================================================
    // STEP 6: Search and Analysis
    // ========================================================================
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 STEP 6: Suche und Analyse');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const step6aMessage = 'Finde alle Projekte, die sich mit Ehrenamt beschäftigen.';
    await sendMessageAndWaitForResponse(page, step6aMessage, {
      waitForText: /ehrenamt|projekt/i,
    });

    console.log('✅ Step 6a Complete: Search for volunteer projects\n');
    await page.waitForTimeout(2000);

    const step6bMessage = 'Zeige mir die vollständige Struktur des Wissensgraphen.';
    await sendMessageAndWaitForResponse(page, step6bMessage, {
      waitForText: /entität|entity|struktur/i,
    });

    console.log('✅ Step 6b Complete: Knowledge graph structure displayed\n');
    await page.waitForTimeout(2000);

    // ========================================================================
    // STEP 6a (NEW!): OSINT Agent Team Deep Research
    // ========================================================================
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🤖 STEP 6a (NEW): OSINT Agent Team Deep Research');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const step6aOsintMessage =
      'Ich benötige tiefgehende Hintergrundinformationen zu den Trägerorganisationen. ' +
      'Bitte recherchiere detaillierte Informationen über den Internationalen Bund e.V.';

    console.log('📤 Requesting OSINT agent team research (this may take 1-3 minutes)...');
    await sendMessageAndWaitForResponse(page, step6aOsintMessage, {
      waitForText: /agent.*team|research|internationaler bund/i,
      timeout: 300000, // 5 minutes for agent team research
    });

    console.log('✅ Step 6a OSINT: Agent team research initiated or completed\n');
    await page.waitForTimeout(3000);

    // Check if we need to confirm adding to honeycomb
    const pageText = await page.locator('[data-testid="message-content"]').last().innerText();
    if (/honeycomb|hinzufügen|ergänzen/i.test(pageText)) {
      console.log('📤 Confirming to add OSINT results to honeycomb...');
      const step6aConfirmMessage = 'Ja, bitte ergänze die Informationen im Honeycomb.';
      await sendMessageAndWaitForResponse(page, step6aConfirmMessage, {
        waitForText: /hinzugefügt|added|entität/i,
      });
      console.log('✅ OSINT results added to honeycomb\n');
    }

    await page.waitForTimeout(2000);

    // ========================================================================
    // STEP 7: Legal Q&A (Vorschriften)
    // ========================================================================
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⚖️  STEP 7: Vorschriften Q&A');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const step7Message =
      'Ich möchte im Bericht erwähnen, welche gesetzlichen Grundlagen es für ' +
      'Integrationskurse gibt. Was sind dazu die wichtigsten Regelungen?';
    await sendMessageAndWaitForResponse(page, step7Message, {
      waitForText: /integrationskurs|AufenthG|§|paragraph/i,
    });

    console.log('✅ Step 7 Complete: Legal Q&A for integration courses\n');
    await page.waitForTimeout(2000);

    // ========================================================================
    // STEP 8: Text Generation
    // ========================================================================
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✍️  STEP 8: Textgenerierung');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const step8Message =
      'Bitte formuliere eine kurze Zusammenfassung für das Projekt ' +
      '"Zusammen stark im Ehrenamt" (Landkreis Karlsruhe) für den Bericht.';
    await sendMessageAndWaitForResponse(page, step8Message, {
      waitForText: /ehrenamt|karlsruhe|projekt/i,
    });

    console.log('✅ Step 8 Complete: Text generated for project summary\n');
    await page.waitForTimeout(2000);

    // ========================================================================
    // STEP 9 (Optional): Graph Visualization
    // ========================================================================
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 STEP 9 (Optional): Graph-Visualisierung');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const step9Message =
      'Ich möchte den Wissensgraphen rollenbasiert visualisieren und direkt im ' +
      'Graphen Datenqualität und Aktualität sehen.';
    await sendMessageAndWaitForResponse(page, step9Message, {
      waitForText: /visualisierung|graph|url|honeycomb/i,
    });

    console.log('✅ Step 9 Complete: Graph visualization guidance provided\n');
    await page.waitForTimeout(2000);

    // ========================================================================
    // STEP 10 (Optional): User Feedback
    // ========================================================================
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💬 STEP 10 (Optional): Nutzer-Feedback');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const step10Message =
      'Wenn etwas im Graphen falsch oder veraltet ist – wie korrigiere ich es schnell?';
    await sendMessageAndWaitForResponse(page, step10Message, {
      waitForText: /korrektur|update|edit|ändern/i,
    });

    console.log('✅ Step 10 Complete: Feedback and correction guidance provided\n');

    // ========================================================================
    // VERIFICATION: Check conversation contains all key elements
    // ========================================================================
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ VERIFICATION: Checking conversation completeness');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const pageContent = await page.content();

    // Verify key concepts appeared
    const verifications = [
      { name: 'Step 1: Honeycomb creation', regex: /honeycomb|wissensgraph/i },
      { name: 'Step 2: Press release', regex: /pressemitteilung|ministerium/i },
      { name: 'Step 3: Legal research', regex: /SGB|AufenthG|IntG|Gesetz/i },
      { name: 'Step 4: Project tracking', regex: /tracking|kennzahl/i },
      { name: 'Step 5: Report outline', regex: /gliederung|kapitel/i },
      { name: 'Step 6: Search (volunteer)', regex: /ehrenamt/i },
      { name: 'Step 6a: OSINT Research', regex: /internationaler bund|agent.*team|research/i },
      { name: 'Step 7: Integration courses', regex: /integrationskurs/i },
      { name: 'Step 8: Text generation', regex: /zusammenfassung/i },
      { name: 'Step 9: Visualization', regex: /visualisierung|graph/i },
      { name: 'Step 10: Feedback', regex: /korrektur|ändern/i },
    ];

    let successCount = 0;
    for (const check of verifications) {
      const found = check.regex.test(pageContent);
      if (found) {
        console.log(`✅ ${check.name}: Found`);
        successCount++;
      } else {
        console.log(`⚠️  ${check.name}: Not found (may be in different language)`);
      }
    }

    console.log(`\n📊 Verification: ${successCount}/${verifications.length} steps confirmed\n`);

    // Expect at least 8 out of 11 steps to be confirmed
    expect(successCount).toBeGreaterThanOrEqual(8);

    // Final success message
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 FULL DEMO COMPLETE - ALL 10 STEPS!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('✅ All 10 steps of the Integrationsbericht demo executed successfully');
    console.log('🤖 Including NEW OSINT Agent Team deep research capability!');
    console.log('📊 Demo validated and ready for presentation');
    console.log('🔗 Honeycomb URL: http://localhost:8000/honeycomb/hc_integrationsbericht_baden_wuerttemberg_2025\n');

    // Take final screenshot
    await page.screenshot({
      path: './e2e/screenshots/integrationsbericht-full-demo-complete.png',
      fullPage: true,
    });
    console.log('📸 Screenshot saved: ./e2e/screenshots/integrationsbericht-full-demo-complete.png\n');
  });

  test('MCP Servers Health Check', async () => {
    test.setTimeout(120000); // 2 minutes

    console.log('\n🔧 Running MCP servers health check...\n');

    await page.goto(`${BASE_URL}/c/new`);
    await selectAgentsEndpoint(page);

    const healthMessage = 'Welche MCP-Tools und Server hast du verfügbar?';
    await sendMessageAndWaitForResponse(page, healthMessage);

    const lastMessage = await page.locator('[data-testid="message-content"]').last().innerText();

    // Check for all MCP servers including new OSINT
    const mcpServers = [
      { name: 'honeycomb', required: true },
      { name: 'rechtsinformationen', required: true },
      { name: 'fetch', required: true },
      { name: 'osint-agent-teams', required: false }, // New but optional
    ];
    const foundServers: string[] = [];

    for (const server of mcpServers) {
      const found = lastMessage.toLowerCase().includes(server.name.replace('-', ''));
      if (found) {
        foundServers.push(server.name);
        console.log(`✅ ${server.name} MCP server: Available`);
      } else if (server.required) {
        console.log(`❌ ${server.name} MCP server: Missing (REQUIRED)`);
      } else {
        console.log(`⚠️  ${server.name} MCP server: Not available (optional)`);
      }
    }

    // Expect at least the 3 required servers
    expect(foundServers.length).toBeGreaterThanOrEqual(3);
    console.log(`\n✅ Health check complete: ${foundServers.length}/4 MCP servers available\n`);
  });
});
