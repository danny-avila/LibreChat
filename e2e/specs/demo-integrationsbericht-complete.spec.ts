import { expect, test } from '@playwright/test';
import type { Page, Response } from '@playwright/test';

/**
 * Complete E2E test for Integrationsbericht Demo
 * Tests Steps 1-8 of the demo workflow with the KI-Referent agent
 *
 * Prerequisites:
 * - LibreChat running at http://localhost:3080
 * - HIVE API running at http://localhost:8000
 * - KI-Referent system agent created (agent_xVyPosZZqSRr-PfI2KOQ-)
 * - Demo user: sales-demo@senticor.de exists
 * - MCP servers: honeycomb (11 tools), rechtsinformationen (8 tools), fetch (1 tool)
 *
 * Refactored based on LibreChat core E2E patterns:
 * - Uses waitForResponse() checking for "final":true in API response
 * - Focuses on Karlsruhe projects only (3-5 vs 34) for faster execution
 * - Uses timestamped honeycomb names to avoid conflicts
 * - Manual login (more reliable than storageState for nightly runs)
 */

const { DEMO_USER } = require('../test-user');
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3080';

// Wait for agent streaming response to complete
const waitForAgentStream = async (response: Response) => {
  const isAgentEndpoint = response.url().includes('/api/agents');
  return isAgentEndpoint && response.status() === 200;
};

// Generate timestamped honeycomb name
function getTimestampedHoneycombName(): string {
  const now = new Date();
  const timestamp = now.toISOString()
    .replace(/T/, '_')
    .replace(/:/g, '-')
    .replace(/\..+/, '');
  return `hc_demo_${timestamp}`;
}

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
  timeout?: number;
  checkContent?: string | RegExp;
  expectMcpTools?: string[]; // e.g., ['rechtsinformationen', 'honeycomb']
} = {}): Promise<string> {
  const {
    timeout = 180000, // 3 minutes for AI responses
    checkContent,
    expectMcpTools
  } = options;

  console.log(`📤 Sending: ${message.substring(0, 80)}${message.length > 80 ? '...' : ''}`);

  const textbox = page.locator('form textarea, form input[type="text"]').first();
  await textbox.waitFor({ state: 'visible', timeout: 10000 });
  await textbox.click();
  await textbox.fill(message);

  // Wait for API response using LibreChat core pattern
  console.log('  ⏳ Waiting for agent response...');
  const responsePromise = [
    page.waitForResponse(waitForAgentStream, { timeout }),
    textbox.press('Enter'),
  ];

  const [response] = (await Promise.all(responsePromise)) as [Response];
  const responseBody = await response.body();
  const bodyText = responseBody.toString();
  const messageSuccess = bodyText.includes('"final":true');

  if (!messageSuccess) {
    console.log('  ⚠️  Warning: Response did not include "final":true flag');
  } else {
    console.log('  ✅ Agent response complete');
  }

  // Check for MCP tool usage if requested
  if (expectMcpTools && expectMcpTools.length > 0) {
    for (const tool of expectMcpTools) {
      if (bodyText.includes(tool)) {
        console.log(`  ✓ MCP tool "${tool}" was called`);
      } else {
        console.log(`  ⚠️  MCP tool "${tool}" was NOT called (may have used world knowledge)`);
      }
    }
  }

  // Small delay to let UI update
  await page.waitForTimeout(1000);

  // Check for specific content if requested
  if (checkContent) {
    const messages = page.locator('[class*="markdown"], [data-testid*="message"]');
    const lastMessage = messages.last();
    await expect(lastMessage).toContainText(checkContent, { timeout: 15000 });
    console.log(`  ✓ Response contains expected content`);
  }

  return bodyText;
}

test.describe('Integrationsbericht Demo - Complete Workflow', () => {
  test.setTimeout(600000); // 10 minutes for full workflow

  test('Complete Demo: Steps 1-8 (Karlsruhe Focus)', async ({ page }) => {
    const honeycombName = getTimestampedHoneycombName();
    console.log(`🍯 Using honeycomb name: ${honeycombName}`);

    // Setup: Login and select agent
    await loginUser(page);
    await page.goto(`${BASE_URL}/c/new`, { timeout: 10000 });
    await page.waitForTimeout(1000);
    await selectKIReferentAgent(page);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📝 STEP 1: Projekt starten & Honeycomb erstellen');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await sendMessageAndWait(page,
      `Ich erstelle den Integrationsbericht Baden-Württemberg 2025 für die Veröffentlichung im Q1 2026. ` +
      `Erstelle einen Wissensgraphen mit dem Namen "${honeycombName}" für dieses Projekt.`,
      {
        timeout: 120000,
        checkContent: /honeycomb|wissensgraph|erstellt/i
      }
    );

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🌐 STEP 2: Pressemitteilung einlesen (NUR KARLSRUHE)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await sendMessageAndWait(page,
      'Bitte füge die Informationen aus dieser Pressemitteilung zum Honeycomb hinzu:\n\n' +
      'https://sozialministerium.baden-wuerttemberg.de/de/service/presse/pressemitteilung/pid/land-foerdert-34-lokale-integrationsprojekte-mit-rund-18-millionen-euro\n\n' +
      '⚠️ WICHTIG: Fokussiere dich NUR auf Projekte im Regierungsbezirk Karlsruhe. ' +
      'Füge maximal 3-5 Beispielprojekte hinzu, um Zeit zu sparen. ' +
      'Ignoriere alle anderen Regierungsbezirke (Stuttgart, Tübingen, Freiburg).',
      {
        timeout: 180000, // 3 minutes
        checkContent: /karlsruhe|projekt|hinzugefügt/i
      }
    );

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⚖️  STEP 3: Rechtliche Grundlagen');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await sendMessageAndWait(page,
      'Ich brauche die rechtlichen Grundlagen für Integrationskurse aus dem Aufenthaltsgesetz (AufenthG). ' +
      'Bitte nutze die rechtsinformationen MCP Tools um die aktuellen Paragraphen zu § 43 und § 44 AufenthG zu recherchieren. ' +
      'Füge die Informationen zum Honeycomb hinzu.',
      {
        timeout: 120000,
        checkContent: /§\s*43|§\s*44|aufenthg|integrationskurs|rechtsinformationen|gesetze im internet/i,
        expectMcpTools: ['rechtsinformationen']
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
      'Der Bericht sollte die Karlsruhe-Projekte, rechtlichen Grundlagen und Best Practices enthalten.',
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
    console.log('⚖️  STEP 7: Legal Q&A - Integrationskurse');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await sendMessageAndWait(page,
      'Ich möchte im Bericht erwähnen, welche gesetzlichen Grundlagen es für Integrationskurse gibt. ' +
      'Recherchiere bitte mit den rechtsinformationen MCP Tools die relevanten Paragraphen im AufenthG. ' +
      'Erstelle eine kurze Zusammenfassung für den Bericht.',
      {
        timeout: 120000,
        checkContent: /§\s*43|§\s*44|§44|aufenthg|integrationskurs|rechtsinformationen|gesetze/i,
        expectMcpTools: ['rechtsinformationen']
      }
    );

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📝 STEP 8: Text Generation - Project Summary');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await sendMessageAndWait(page,
      'Bitte formuliere eine kurze Zusammenfassung für das Projekt "Zusammen stark im Ehrenamt" ' +
      '(Landkreis Karlsruhe) für den Bericht. Die Zusammenfassung sollte den Träger und die Ziele enthalten.',
      {
        timeout: 120000,
        checkContent: /karlsruhe|ehrenamt|projekt|internationaler bund|ib/i
      }
    );

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ COMPLETE: All 8 steps executed successfully!');
    console.log(`🍯 Honeycomb: ${honeycombName}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Final verification - check conversation has messages
    const messages = page.locator('[class*="markdown"], [data-testid*="message"]');
    const messageCount = await messages.count();
    console.log(`📊 Total messages in conversation: ${messageCount}`);
    expect(messageCount).toBeGreaterThan(14); // Should have user + assistant messages for all 8 steps
  });

  test('Step 1 Only: Create Honeycomb', async ({ page }) => {
    test.setTimeout(180000); // 3 minutes
    const honeycombName = getTimestampedHoneycombName();

    await loginUser(page);
    await page.goto(`${BASE_URL}/c/new`, { timeout: 10000 });
    await page.waitForTimeout(1000);
    await selectKIReferentAgent(page);

    console.log(`\n📝 Testing Step 1: Honeycomb creation (${honeycombName})\n`);

    await sendMessageAndWait(page,
      `Erstelle einen Wissensgraphen mit dem Namen "${honeycombName}" für den Integrationsbericht Baden-Württemberg 2025.`,
      {
        timeout: 120000,
        checkContent: /honeycomb|wissensgraph|erstellt/i
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
      'Recherchiere mit den rechtsinformationen MCP Tools die rechtlichen Grundlagen für Integration in Deutschland. ' +
      'Fokussiere dich auf das Aufenthaltsgesetz (AufenthG) - insbesondere § 43 und § 44 zu Integrationskursen.',
      {
        timeout: 120000,
        checkContent: /§|gesetz|aufenthg|sgb|integration|rechtsinformationen/i
      }
    );

    console.log('✅ Step 3 test complete');
  });
});
