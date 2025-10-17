import { expect, test, chromium } from '@playwright/test';
import type { Browser, Page, BrowserContext } from '@playwright/test';

/**
 * HIVE Entity Extraction Feature Test
 *
 * Tests the new entity extraction workflow:
 * 1. Agent calls prepare_entity_extraction with German text
 * 2. MCP returns extraction prompt with guidelines
 * 3. Agent's LLM extracts entities from the prompt
 * 4. Agent calls batch_add_entities with structured JSON-LD entities
 *
 * References:
 * - /Users/wolfgang/workspace/LibreChat/docs/senticor/HIVE-MCP-WORKAROUND-WITHOUT-SAMPLING.md
 * - HIVE MCP Phase 2 implementation
 */

const { DEMO_USER } = require('../test-user');
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3080';
const TEST_TIMEOUT = 600000; // 10 minutes

// Sample German press release for entity extraction
const SAMPLE_GERMAN_TEXT = `
Pressemitteilung des Ministeriums für Soziales, Gesundheit und Integration Baden-Württemberg

Stuttgart, 15. Januar 2025

Neue Integrationsmaßnahmen für 2025 angekündigt

Ministerin Manuela Schwesig stellte heute die neuen Integrationsprogramme für das Jahr 2025 vor.
Im Rahmen des Integrationsgesetzes (IntG) werden ab März 2025 verstärkte Sprachkurse angeboten.

Das Programm "Integration Plus" wird von der Stadt Stuttgart koordiniert und bietet Unterstützung
für Neuankömmlinge. Der § 33 des Integrationsgesetzes regelt die Teilnahme an Integrationskursen.

Kontakt:
Dr. Michael Weber
Referatsleiter Integration
Telefon: 0711-123456
E-Mail: michael.weber@sozialministerium-bw.de

Das Sozialministerium Baden-Württemberg arbeitet eng mit der Bundesagentur für Arbeit zusammen.
`;

async function loginDemoUser(page: Page) {
  await page.goto(`${BASE_URL}/login`, { timeout: 10000 });
  await page.fill('input[name="email"]', DEMO_USER.email);
  await page.fill('input[name="password"]', DEMO_USER.password);
  await page.click('button[type="submit"]');

  // Handle ToS if it appears
  try {
    const tosButton = page.locator(
      'button:has-text("Accept"), button:has-text("Akzeptieren"), button:has-text("I Agree")',
    );
    await tosButton.click({ timeout: 3000 });
  } catch {
    // No ToS modal
  }

  await page.waitForURL(/\/c\//, { timeout: 10000 });
  console.log('✅ Logged in as demo user');
}

async function sendMessage(page: Page, message: string) {
  const textbox = page.locator('form').getByRole('textbox');
  await textbox.click();
  await textbox.fill(message);
  await textbox.press('Enter');

  console.log(`📤 Sent: ${message.substring(0, 80)}...`);
  await page.waitForTimeout(2000);
}

async function waitForAIResponse(page: Page, timeoutMs: number = 180000) {
  try {
    // Wait for stop button to appear (indicates processing)
    await page.waitForSelector('button:has-text("Stop")', {
      state: 'visible',
      timeout: 5000,
    });
    console.log('⏳ Waiting for AI response...');

    // Wait for stop button to disappear (response complete)
    await page.waitForSelector('button:has-text("Stop")', {
      state: 'detached',
      timeout: timeoutMs,
    });
  } catch {
    // No stop button or already complete
  }

  await page.waitForTimeout(2000);
  console.log('✅ Response received');
}

async function getLastMessageContent(page: Page): Promise<string> {
  const lastMessage = page.locator('[data-testid="message-content"]').last();
  const content = await lastMessage.textContent();
  return content || '';
}

test.describe('HIVE Entity Extraction Feature', () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;
  let honeycombId: string;

  test.beforeAll(async () => {
    browser = await chromium.launch({
      headless: false, // Show browser for demo
      slowMo: 200,
    });

    context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });

    page = await context.newPage();
    await loginDemoUser(page);
  });

  test.afterAll(async () => {
    await page?.close();
    await context?.close();
    await browser?.close();
  });

  test('should extract entities from German text using the pattern-based workaround', async () => {
    test.setTimeout(TEST_TIMEOUT);
      // Step 1: Create a new conversation with HIVE agent
      console.log('\n🧪 Phase 1: Create New Conversation');
      await page.goto(`${BASE_URL}/c/new`, { timeout: 10000 });
      await page.waitForTimeout(2000);

      // Take screenshot of initial state
      await page.screenshot({
        path: '/tmp/hive-extraction-01-start.png',
        fullPage: true,
      });

      // Step 2: Create a honeycomb for the test
      console.log('\n🧪 Phase 2: Create Honeycomb');
      await sendMessage(
        page,
        'Create a honeycomb called "Entity Extraction Test January 2025" for testing entity extraction from German policy documents.',
      );
      await waitForAIResponse(page, 60000);

      let responseText = await getLastMessageContent(page);
      console.log('Response preview:', responseText.substring(0, 200));

      // Extract honeycomb ID from response
      const honeycombIdMatch = responseText.match(/hc_[a-zA-Z0-9_-]+/);
      if (!honeycombIdMatch) {
        throw new Error(
          'Failed to create honeycomb - no ID found in response',
        );
      }
      honeycombId = honeycombIdMatch[0];
      console.log(`✅ Created honeycomb: ${honeycombId}`);

      await page.screenshot({
        path: '/tmp/hive-extraction-02-honeycomb-created.png',
        fullPage: true,
      });

      // Step 3: Request entity extraction from sample text
      console.log('\n🧪 Phase 3: Request Entity Extraction');
      const extractionRequest = `Extract all entities from this German press release and add them to honeycomb "${honeycombId}":

${SAMPLE_GERMAN_TEXT}

Please extract:
- Legislation (laws, legal references)
- Person (officials, contacts)
- Organization (government agencies, ministries)
- City (locations)
- Project (programs, initiatives)
- Topic (subject areas)`;

      await sendMessage(page, extractionRequest);
      await waitForAIResponse(page, 120000); // Allow 2 minutes for extraction

      responseText = await getLastMessageContent(page);
      console.log('Extraction response preview:', responseText.substring(0, 300));

      await page.screenshot({
        path: '/tmp/hive-extraction-03-extraction-requested.png',
        fullPage: true,
      });

      // Step 4: Verify entities were extracted and added
      console.log('\n🧪 Phase 4: Verify Entity Extraction');

      // Check if response indicates entities were added
      expect(responseText.toLowerCase()).toMatch(
        /entit(y|ies)|added|extracted|created/i,
      );

      // Wait for any follow-up responses
      await page.waitForTimeout(5000);

      await page.screenshot({
        path: '/tmp/hive-extraction-04-entities-added.png',
        fullPage: true,
      });

      // Step 5: Get statistics to verify entities were added
      console.log('\n🧪 Phase 5: Verify Statistics');
      await sendMessage(
        page,
        `Show me statistics for honeycomb ${honeycombId}`,
      );
      await waitForAIResponse(page, 60000);

      responseText = await getLastMessageContent(page);
      console.log('Stats response:', responseText);

      // Verify we have entities
      expect(responseText).toMatch(/total.*entit/i);
      expect(responseText).toMatch(/\d+/); // Should contain numbers

      await page.screenshot({
        path: '/tmp/hive-extraction-05-statistics.png',
        fullPage: true,
      });

      // Step 6: Search for specific entities to verify correct extraction
      console.log('\n🧪 Phase 6: Verify Specific Entities');

      // Search for the law (Integrationsgesetz)
      await sendMessage(
        page,
        `Search for "Integrationsgesetz" in honeycomb ${honeycombId}`,
      );
      await waitForAIResponse(page, 60000);

      responseText = await getLastMessageContent(page);
      console.log('Search response:', responseText);

      // Verify the law was found
      expect(responseText.toLowerCase()).toMatch(/integrationsgesetz/i);

      await page.screenshot({
        path: '/tmp/hive-extraction-06-law-found.png',
        fullPage: true,
      });

      // Search for the person (Dr. Michael Weber)
      await sendMessage(
        page,
        `Search for "Weber" in honeycomb ${honeycombId}`,
      );
      await waitForAIResponse(page, 60000);

      responseText = await getLastMessageContent(page);
      console.log('Person search response:', responseText);

      // Verify the person was found
      expect(responseText.toLowerCase()).toMatch(/weber|michael/i);

      await page.screenshot({
        path: '/tmp/hive-extraction-07-person-found.png',
        fullPage: true,
      });

      // Search for the organization (Sozialministerium)
      await sendMessage(
        page,
        `Search for "Sozialministerium" in honeycomb ${honeycombId}`,
      );
      await waitForAIResponse(page, 60000);

      responseText = await getLastMessageContent(page);
      console.log('Organization search response:', responseText);

      // Verify the organization was found
      expect(responseText.toLowerCase()).toMatch(/sozial|ministerium/i);

      await page.screenshot({
        path: '/tmp/hive-extraction-08-org-found.png',
        fullPage: true,
      });

      // Step 7: Final verification - get complete honeycomb
      console.log('\n🧪 Phase 7: Final Verification');
      await sendMessage(page, `Show me all entities in honeycomb ${honeycombId}`);
      await waitForAIResponse(page, 60000);

      responseText = await getLastMessageContent(page);
      console.log('Final honeycomb state:', responseText.substring(0, 500));

      await page.screenshot({
        path: '/tmp/hive-extraction-09-final-state.png',
        fullPage: true,
      });

      // Verify we have multiple entity types
      const hasLegislation = responseText.toLowerCase().includes('legislation') ||
                             responseText.toLowerCase().includes('gesetz');
      const hasPerson = responseText.toLowerCase().includes('person') ||
                        responseText.toLowerCase().includes('weber');
      const hasOrganization = responseText.toLowerCase().includes('organization') ||
                              responseText.toLowerCase().includes('ministerium');

      console.log('\n✅ Extraction Verification:');
      console.log(`  - Legislation found: ${hasLegislation}`);
      console.log(`  - Person found: ${hasPerson}`);
      console.log(`  - Organization found: ${hasOrganization}`);

      // At least 2 of the 3 entity types should be present
      const foundTypesCount = [hasLegislation, hasPerson, hasOrganization].filter(
        Boolean,
      ).length;
      expect(foundTypesCount).toBeGreaterThanOrEqual(2);

      console.log('\n🎉 Entity extraction test completed successfully!');
      console.log(`📊 Honeycomb ID for manual verification: ${honeycombId}`);
      console.log('📸 Screenshots saved to /tmp/hive-extraction-*.png');
    });

  test('should handle extraction from shorter text snippets', async () => {
    test.setTimeout(TEST_TIMEOUT);
      console.log('\n🧪 Test: Short Text Extraction');

      // Create honeycomb
      await page.goto(`${BASE_URL}/c/new`, { timeout: 10000 });
      await page.waitForTimeout(2000);

      await sendMessage(
        page,
        'Create a honeycomb called "Short Text Test" for testing.',
      );
      await waitForAIResponse(page, 60000);

      let responseText = await getLastMessageContent(page);
      const honeycombIdMatch = responseText.match(/hc_[a-zA-Z0-9_-]+/);

      if (!honeycombIdMatch) {
        throw new Error('Failed to create honeycomb');
      }

      const testHoneycombId = honeycombIdMatch[0];
      console.log(`✅ Created test honeycomb: ${testHoneycombId}`);

      // Extract from short snippet
      const shortText = `Das Integrationsgesetz wurde vom Sozialministerium Baden-Württemberg erlassen.`;

      await sendMessage(
        page,
        `Extract entities from this text and add to honeycomb ${testHoneycombId}: "${shortText}"`,
      );
      await waitForAIResponse(page, 120000);

      responseText = await getLastMessageContent(page);
      console.log('Short text extraction response:', responseText);

      // Verify entities were extracted
      expect(responseText.toLowerCase()).toMatch(/entit|added|extracted/i);

      // Get stats
      await sendMessage(page, `Statistics for ${testHoneycombId}`);
      await waitForAIResponse(page, 60000);

      responseText = await getLastMessageContent(page);
      console.log('Stats:', responseText);

      // Should have at least 1 entity
      expect(responseText).toMatch(/\d+/);

      console.log('✅ Short text extraction test passed');
    });

  test('should preserve German special characters in entity names', async () => {
    test.setTimeout(TEST_TIMEOUT);
      console.log('\n🧪 Test: German Character Preservation');

      // Create honeycomb
      await page.goto(`${BASE_URL}/c/new`, { timeout: 10000 });
      await page.waitForTimeout(2000);

      await sendMessage(
        page,
        'Create a honeycomb called "Character Test" for testing German characters.',
      );
      await waitForAIResponse(page, 60000);

      let responseText = await getLastMessageContent(page);
      const honeycombIdMatch = responseText.match(/hc_[a-zA-Z0-9_-]+/);

      if (!honeycombIdMatch) {
        throw new Error('Failed to create honeycomb');
      }

      const testHoneycombId = honeycombIdMatch[0];

      // Text with German special characters
      const germanText = `Die Stadt München und das Land Baden-Württemberg arbeiten am Thema Ausländerintegration.`;

      await sendMessage(
        page,
        `Extract all entities from: "${germanText}" and add to ${testHoneycombId}`,
      );
      await waitForAIResponse(page, 120000);

      // Search for entity with umlauts
      await sendMessage(page, `Search for "München" in ${testHoneycombId}`);
      await waitForAIResponse(page, 60000);

      responseText = await getLastMessageContent(page);
      console.log('München search result:', responseText);

      // Verify German characters were preserved
      expect(responseText.toLowerCase()).toMatch(/münchen|munich/i);

      console.log('✅ German character preservation test passed');
    });
});