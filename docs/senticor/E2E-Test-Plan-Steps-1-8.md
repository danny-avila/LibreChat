# E2E Test Plan: Demo Steps 1-8

**Date**: 2025-10-14
**Purpose**: Robust Playwright E2E tests for Integrationsbericht Demo
**Target**: Steps 1-8 (production-ready features)

---

## Overview

### Current State
You already have good test coverage:
- ✅ `integrationsbericht-demo.spec.ts` - Multiple atomic tests for individual features
- ✅ `integrationsbericht-complete-journey.spec.ts` - Full 6-step journey test
- ✅ `hive-entity-extraction.spec.ts` - Entity extraction validation

### What's Missing for Steps 1-8
The existing tests cover Steps 1-6. We need to add:
- ❌ **Step 7**: Legal Q&A (using stored paragraphs)
- ❌ **Step 8**: Text generation with citations
- ❌ **Enhanced assertions** for MCP tool calls
- ❌ **HIVE API validation** (verify honeycomb actually created)
- ❌ **Data quality checks** (source URLs, dates)

---

## Test Architecture

### Test Suite Structure

```
e2e/specs/integrationsbericht/
├── 01-honeycomb-creation.spec.ts       (Step 1)
├── 02-press-release-fetch.spec.ts      (Step 2)
├── 03-legal-research.spec.ts           (Step 3)
├── 04-project-tracking.spec.ts         (Step 4)
├── 05-report-outline.spec.ts           (Step 5)
├── 06-search-analysis.spec.ts          (Step 6)
├── 07-legal-qa.spec.ts                 (Step 7) 🆕
├── 08-text-generation.spec.ts          (Step 8) 🆕
├── full-journey-steps-1-8.spec.ts      (Integration test)
└── helpers/
    ├── demo-helpers.ts
    ├── mcp-assertions.ts
    └── hive-api-client.ts
```

---

## Test Helpers Needed

### 1. Demo Helpers (`e2e/specs/integrationsbericht/helpers/demo-helpers.ts`)

```typescript
import { Page, expect } from '@playwright/test';

/**
 * Select Agents endpoint and wait for ready state
 */
export async function selectAgentsEndpoint(page: Page) {
  // Click model selector
  await page.locator('button:has-text("gpt-5")').first().click();
  await page.waitForTimeout(500);

  // Select "My Agents"
  await page.locator('[role="option"]:has-text("My Agents")').click();
  await page.waitForTimeout(1000);

  // Verify agents endpoint selected
  const endpoint = await page.locator('button').filter({ hasText: /agents/i }).count();
  expect(endpoint).toBeGreaterThan(0);
}

/**
 * Send message and wait for complete response
 */
export async function sendMessage(
  page: Page,
  message: string,
  options?: {
    expectToolCall?: string;
    expectContent?: string | RegExp;
    timeout?: number;
  }
) {
  const { expectToolCall, expectContent, timeout = 180000 } = options || {};

  // Fill and send message
  const textbox = page.locator('form').getByRole('textbox');
  await textbox.click();
  await textbox.fill(message);

  // Wait for response start
  const responsePromise = page.waitForResponse(
    (response) => {
      return response.url().includes('/api/agents') && response.status() === 200;
    },
    { timeout }
  );

  await textbox.press('Enter');
  const response = await responsePromise;

  // Verify tool call if specified
  if (expectToolCall) {
    const responseBody = await response.text();
    expect(responseBody).toContain(expectToolCall);
  }

  // Wait for response completion
  await page.waitForSelector('[data-testid="continue-generation-button"]', {
    state: 'detached',
    timeout
  });

  // Additional UI settle time
  await page.waitForTimeout(1000);

  // Verify content if specified
  if (expectContent) {
    const lastMessage = await page.locator('[data-testid="message-content"]').last();
    await expect(lastMessage).toContainText(expectContent, { timeout: 5000 });
  }

  return response;
}

/**
 * Extract honeycomb ID from response
 */
export async function extractHoneycombId(page: Page): Promise<string | null> {
  const lastMessage = await page.locator('[data-testid="message-content"]').last().innerText();

  // Look for honeycomb ID pattern: hc_*
  const match = lastMessage.match(/hc_[a-z0-9_]+/i);
  return match ? match[0] : null;
}

/**
 * Wait for specific tool call in response stream
 */
export async function waitForToolCall(page: Page, toolName: string, timeout = 60000) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const messages = await page.locator('[data-testid="message-content"]').allInnerTexts();
    const lastMessage = messages[messages.length - 1];

    if (lastMessage && lastMessage.includes(toolName)) {
      return true;
    }

    await page.waitForTimeout(500);
  }

  throw new Error(`Tool call "${toolName}" not found within ${timeout}ms`);
}
```

---

### 2. MCP Assertions (`e2e/specs/integrationsbericht/helpers/mcp-assertions.ts`)

```typescript
import { expect } from '@playwright/test';
import type { Response } from '@playwright/test';

/**
 * Assert that a specific MCP tool was called
 */
export async function assertToolCalled(response: Response, toolName: string) {
  const body = await response.text();
  expect(body).toContain(toolName);
}

/**
 * Assert batch_add_entities was used (not add_entity_to_honeycomb)
 */
export async function assertBatchAddUsed(response: Response) {
  const body = await response.text();

  // Should use batch_add_entities
  expect(body).toContain('batch_add_entities');

  // Should NOT use buggy add_entity_to_honeycomb
  expect(body).not.toContain('add_entity_to_honeycomb');
}

/**
 * Assert multiple tools were called in sequence
 */
export function createToolCallTracker() {
  const calls: string[] = [];

  return {
    track: async (response: Response, toolName: string) => {
      const body = await response.text();
      if (body.includes(toolName)) {
        calls.push(toolName);
      }
    },
    assertSequence: (expectedSequence: string[]) => {
      expect(calls).toEqual(expect.arrayContaining(expectedSequence));
    },
    getCalls: () => [...calls]
  };
}
```

---

### 3. HIVE API Client (`e2e/specs/integrationsbericht/helpers/hive-api-client.ts`)

```typescript
/**
 * Helper to interact with HIVE API during tests
 */

const HIVE_BASE_URL = 'http://localhost:8000';

export interface HoneycombInfo {
  id: string;
  name: string;
  context: string;
  created_at: string;
  entity_count: number;
  triple_count: number;
}

export interface EntityInfo {
  id: string;
  type: string;
  properties: Record<string, any>;
  source_url?: string;
  source_date?: string;
}

/**
 * Check if HIVE API is running
 */
export async function isHiveApiRunning(): Promise<boolean> {
  try {
    const response = await fetch(`${HIVE_BASE_URL}/health`);
    const data = await response.json();
    return data.status === 'healthy';
  } catch {
    return false;
  }
}

/**
 * Get honeycomb info from HIVE API
 */
export async function getHoneycomb(honeycombId: string): Promise<HoneycombInfo | null> {
  try {
    const response = await fetch(`${HIVE_BASE_URL}/api/honeycomb/${honeycombId}`);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * List all honeycombs
 */
export async function listHoneycombs(): Promise<HoneycombInfo[]> {
  try {
    const response = await fetch(`${HIVE_BASE_URL}/api/honeycombs`);
    if (!response.ok) return [];
    const data = await response.json();
    return data.honeycombs || [];
  } catch {
    return [];
  }
}

/**
 * Search entities in honeycomb
 */
export async function searchEntities(
  honeycombId: string,
  query: string
): Promise<EntityInfo[]> {
  try {
    const response = await fetch(`${HIVE_BASE_URL}/api/honeycomb/${honeycombId}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    if (!response.ok) return [];
    const data = await response.json();
    return data.results || [];
  } catch {
    return [];
  }
}

/**
 * Get entity count in honeycomb
 */
export async function getEntityCount(honeycombId: string): Promise<number> {
  const honeycomb = await getHoneycomb(honeycombId);
  return honeycomb?.entity_count || 0;
}

/**
 * Verify entity exists with specific properties
 */
export async function verifyEntityExists(
  honeycombId: string,
  entityType: string,
  expectedProperties?: Record<string, any>
): Promise<boolean> {
  const entities = await searchEntities(honeycombId, entityType);

  if (entities.length === 0) return false;

  if (expectedProperties) {
    return entities.some(entity => {
      return Object.entries(expectedProperties).every(([key, value]) => {
        return entity.properties[key] === value;
      });
    });
  }

  return true;
}

/**
 * Delete honeycomb (cleanup after test)
 */
export async function deleteHoneycomb(honeycombId: string): Promise<boolean> {
  try {
    const response = await fetch(`${HIVE_BASE_URL}/api/honeycomb/${honeycombId}`, {
      method: 'DELETE'
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Wait for entity count to reach expected value
 */
export async function waitForEntityCount(
  honeycombId: string,
  expectedCount: number,
  timeout = 30000
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const count = await getEntityCount(honeycombId);
    if (count >= expectedCount) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return false;
}
```

---

## New Test Specs Needed

### Step 7: Legal Q&A (`07-legal-qa.spec.ts`) 🆕

```typescript
import { test, expect } from '@playwright/test';
import { selectAgentsEndpoint, sendMessage, extractHoneycombId } from './helpers/demo-helpers';
import { getHoneycomb, searchEntities, isHiveApiRunning } from './helpers/hive-api-client';

test.describe('Step 7: Legal Q&A', () => {
  let honeycombId: string;

  test.beforeAll(async () => {
    // Verify HIVE API is running
    const hiveRunning = await isHiveApiRunning();
    if (!hiveRunning) {
      throw new Error('HIVE API is not running at localhost:8000');
    }
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3080/c/new');
    await selectAgentsEndpoint(page);

    // Setup: Create honeycomb with legal paragraphs
    await sendMessage(page,
      'Erstelle einen Honeycomb für Integrationsgesetze und füge folgende Paragraphen hinzu: ' +
      'AufenthG § 43, § 44, § 44a'
    );

    honeycombId = await extractHoneycombId(page) || 'hc_test';

    // Wait for entities to be added
    await page.waitForTimeout(5000);
  });

  test('should answer legal question using stored paragraphs', async ({ page }) => {
    test.setTimeout(120000);

    // Ask legal question
    const response = await sendMessage(page,
      'Welche gesetzlichen Grundlagen gibt es für Integrationskurse?',
      {
        expectContent: /§ 43|§ 44|AufenthG|Integrationskurs/i
      }
    );

    // Verify search_entities was used to find relevant paragraphs
    const body = await response.text();
    expect(body).toContain('search_entities');

    // Verify answer contains citations
    const lastMessage = await page.locator('[data-testid="message-content"]').last().innerText();
    expect(lastMessage).toMatch(/§\s*43/);
    expect(lastMessage).toContain('AufenthG');

    // Verify official URLs are included
    expect(lastMessage).toMatch(/gesetze-im-internet\.de/);
  });

  test('should provide multi-paragraph answer with context', async ({ page }) => {
    test.setTimeout(120000);

    await sendMessage(page,
      'Was regelt das AufenthG zu Integration und Teilnahme an Integrationskursen?',
      {
        expectContent: /Berechtigung|Verpflichtung|Teilnahme/i
      }
    );

    const lastMessage = await page.locator('[data-testid="message-content"]').last().innerText();

    // Should mention multiple paragraphs
    expect(lastMessage).toMatch(/§\s*43/);
    expect(lastMessage).toMatch(/§\s*44/);

    // Should explain context (not just quote)
    expect(lastMessage.length).toBeGreaterThan(200); // Substantive answer
  });

  test('should handle question when paragraphs not in graph', async ({ page }) => {
    test.setTimeout(120000);

    // Ask about paragraphs not yet added
    await sendMessage(page,
      'Was sagt § 67 SGB XII über Hilfe zur Überwindung sozialer Schwierigkeiten?'
    );

    const lastMessage = await page.locator('[data-testid="message-content"]').last().innerText();

    // Should either:
    // 1. Search for the paragraph via rechtsinformationen MCP, OR
    // 2. Indicate it's not in the honeycomb yet

    const hasSearched = lastMessage.match(/deutsche_gesetze_suchen|get_paragraph/i);
    const acknowledgedMissing = lastMessage.match(/nicht.*gefunden|nicht.*honeycomb/i);

    expect(hasSearched || acknowledgedMissing).toBeTruthy();
  });
});
```

---

### Step 8: Text Generation (`08-text-generation.spec.ts`) 🆕

```typescript
import { test, expect } from '@playwright/test';
import { selectAgentsEndpoint, sendMessage, extractHoneycombId } from './helpers/demo-helpers';
import { getHoneycomb, searchEntities, isHiveApiRunning } from './helpers/hive-api-client';

test.describe('Step 8: Text Generation', () => {
  let honeycombId: string;

  test.beforeAll(async () => {
    const hiveRunning = await isHiveApiRunning();
    if (!hiveRunning) {
      throw new Error('HIVE API is not running at localhost:8000');
    }
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3080/c/new');
    await selectAgentsEndpoint(page);

    // Setup: Create honeycomb with project data
    await sendMessage(page,
      'Erstelle einen Honeycomb "Integrationsprojekte BW" und füge hinzu: ' +
      'Projekt "Zusammen stark im Ehrenamt" (Internationaler Bund e.V., Landkreis Karlsruhe), ' +
      'Förderung 1,8 Mio €, Quelle: Pressemitteilung vom 15.03.2024'
    );

    honeycombId = await extractHoneycombId(page) || 'hc_test';
    await page.waitForTimeout(5000);
  });

  test('should generate project summary with citations', async ({ page }) => {
    test.setTimeout(120000);

    const response = await sendMessage(page,
      'Schreibe eine kurze Zusammenfassung für das Projekt "Zusammen stark im Ehrenamt" für den Bericht.',
      {
        expectContent: /Ehrenamt|Internationaler Bund|Karlsruhe/i
      }
    );

    const lastMessage = await page.locator('[data-testid="message-content"]').last().innerText();

    // Should mention key facts
    expect(lastMessage).toContain('Ehrenamt');
    expect(lastMessage).toMatch(/Internationaler Bund|IB/);
    expect(lastMessage).toContain('Karlsruhe');

    // Should include funding info
    expect(lastMessage).toMatch(/1[,.]8.*Mio|Million/i);

    // Should include source citation
    expect(lastMessage).toMatch(/Quelle|Source|PM|Pressemitteilung/i);
    expect(lastMessage).toContain('15.03.2024');
  });

  test('should generate multi-project comparison', async ({ page }) => {
    test.setTimeout(180000);

    // Add second project
    await sendMessage(page,
      'Füge ein zweites Projekt hinzu: "Integration durch Sport" (TSV Heidelberg, Stadt Heidelberg)'
    );

    await page.waitForTimeout(3000);

    // Request comparison
    await sendMessage(page,
      'Vergleiche die beiden Projekte im Honeycomb und schreibe einen Vergleichstext für den Bericht.',
      {
        expectContent: /Ehrenamt|Sport/i
      }
    );

    const lastMessage = await page.locator('[data-testid="message-content"]').last().innerText();

    // Should mention both projects
    expect(lastMessage).toContain('Ehrenamt');
    expect(lastMessage).toContain('Sport');

    // Should mention both locations
    expect(lastMessage).toContain('Karlsruhe');
    expect(lastMessage).toContain('Heidelberg');

    // Should be substantive (comparison, not just listing)
    expect(lastMessage.length).toBeGreaterThan(300);
  });

  test('should generate text in specified style', async ({ page }) => {
    test.setTimeout(120000);

    await sendMessage(page,
      'Schreibe eine formelle, wissenschaftliche Zusammenfassung des Projekts "Zusammen stark im Ehrenamt" ' +
      'mit vollständigen Quellenangaben für einen Regierungsbericht.',
      {
        expectContent: /Projekt|Ehrenamt/i
      }
    );

    const lastMessage = await page.locator('[data-testid="message-content"]').last().innerText();

    // Should have formal tone (check for indicators)
    const formalIndicators = [
      /Das Projekt/,
      /zielt darauf ab|hat zum Ziel/,
      /Gefördert wird/,
      /Im Rahmen/
    ];

    const hasFormalTone = formalIndicators.some(pattern => pattern.test(lastMessage));
    expect(hasFormalTone).toBeTruthy();

    // Should have complete citation
    expect(lastMessage).toMatch(/Quelle:|Source:/);
    expect(lastMessage).toContain('2024');
  });

  test('should handle missing data gracefully', async ({ page }) => {
    test.setTimeout(120000);

    // Request text for non-existent project
    await sendMessage(page,
      'Schreibe eine Zusammenfassung für das Projekt "Digitale Integration München".'
    );

    const lastMessage = await page.locator('[data-testid="message-content"]').last().innerText();

    // Should indicate data not available
    const notFound = lastMessage.match(/nicht.*gefunden|keine.*informationen|nicht.*vorhanden/i);
    expect(notFound).toBeTruthy();

    // Should offer to search or add the project
    const offersHelp = lastMessage.match(/suchen|hinzufügen|erfassen/i);
    expect(offersHelp).toBeTruthy();
  });
});
```

---

## Enhanced Full Journey Test

Update `full-journey-steps-1-8.spec.ts` to include Steps 7-8:

```typescript
// ... existing Steps 1-6 ...

// ========================================================================
// STEP 7: Legal Q&A
// ========================================================================
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('⚖️  STEP 7: Auskunft zu Vorschriften');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const step7Message =
  'Welche gesetzlichen Grundlagen gibt es für Integrationskurse? ' +
  'Ich möchte das im Bericht erwähnen.';
await sendMessageAndWaitForResponse(page, step7Message, /§ 43|§ 44|AufenthG|Integrationskurs/i);

console.log('✅ Step 7 Complete: Legal Q&A answered with citations\n');
await page.waitForTimeout(2000);

// Verify answer includes citations
const step7Response = await page.locator('[data-testid="message-content"]').last().innerText();
expect(step7Response).toMatch(/§\s*43/);
expect(step7Response).toMatch(/§\s*44/);
expect(step7Response).toContain('AufenthG');

// ========================================================================
// STEP 8: Text Generation
// ========================================================================
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📝 STEP 8: Generierung von Berichtstext');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const step8Message =
  'Schreibe eine kurze Zusammenfassung für das Projekt ' +
  '"Zusammen stark im Ehrenamt" (Landkreis Karlsruhe) für den Bericht.';
await sendMessageAndWaitForResponse(page, step8Message, /Ehrenamt|Karlsruhe/i);

console.log('✅ Step 8 Complete: Project summary generated with citations\n');

// Verify summary includes key elements
const step8Response = await page.locator('[data-testid="message-content"]').last().innerText();
expect(step8Response).toContain('Ehrenamt');
expect(step8Response).toContain('Karlsruhe');
expect(step8Response).toMatch(/Quelle|PM|Pressemitteilung/i);
```

---

## Data Quality Assertions

Add assertions to verify data quality in existing tests:

```typescript
/**
 * Add to existing Step 2 test (press release fetching)
 */

// After entities are added, verify via HIVE API
const honeycomb = await getHoneycomb(honeycombId);
expect(honeycomb).not.toBeNull();
expect(honeycomb!.entity_count).toBeGreaterThanOrEqual(5); // 1 ministry + 5 projects

// Verify entities have source URLs
const entities = await searchEntities(honeycombId, 'Projekt');
expect(entities.length).toBeGreaterThan(0);

for (const entity of entities) {
  // Every entity should have source_url
  expect(entity.source_url).toBeTruthy();
  expect(entity.source_url).toMatch(/sozialministerium\.baden-wuerttemberg\.de/);

  // Should have source_date
  expect(entity.source_date).toBeTruthy();
  expect(entity.source_date).toMatch(/2024/);
}
```

---

## What Needs to Be Done

### 1. Create Helper Files (2-3 hours)
- [ ] `e2e/specs/integrationsbericht/helpers/demo-helpers.ts`
- [ ] `e2e/specs/integrationsbericht/helpers/mcp-assertions.ts`
- [ ] `e2e/specs/integrationsbericht/helpers/hive-api-client.ts`

**Effort**: Copy code from this document, adjust imports

---

### 2. Create New Test Specs (4-6 hours)
- [ ] `e2e/specs/integrationsbericht/07-legal-qa.spec.ts`
- [ ] `e2e/specs/integrationsbericht/08-text-generation.spec.ts`

**Effort**: Copy code from this document, adjust for your setup

---

### 3. Enhance Existing Tests (2-3 hours)
- [ ] Add HIVE API assertions to existing tests
- [ ] Add data quality checks (source URLs, dates)
- [ ] Verify `batch_add_entities` is used (not buggy tool)
- [ ] Update `full-journey` test to include Steps 7-8

**Effort**: Add assertions incrementally

---

### 4. Fix/Update Existing Tests (1-2 hours)
- [ ] Update `integrationsbericht-demo.spec.ts` line 102:
  ```typescript
  // OLD (buggy):
  expect(responseBody).toContain('add_entity_to_honeycomb');

  // NEW (correct):
  expect(responseBody).toContain('batch_add_entities');
  ```

- [ ] Add timeout handling for MCP tool calls
- [ ] Add retry logic for flaky network requests

---

### 5. Test Configuration (1 hour)
- [ ] Add environment variables for HIVE API URL
- [ ] Configure test timeouts appropriately:
  ```typescript
  // playwright.config.ts
  expect: {
    timeout: 15000, // Increase for MCP calls
  },
  ```

- [ ] Add test tags for grouping:
  ```typescript
  test('Step 1 @demo @honeycomb', async ({ page }) => {
    // ...
  });
  ```

---

### 6. CI/CD Integration (Optional, 2-3 hours)
- [ ] Add GitHub Actions workflow for demo tests
- [ ] Configure test reporting (HTML + JUnit)
- [ ] Add Slack/email notifications on failure

---

## Running the Tests

### Run All Demo Tests
```bash
cd /Users/wolfgang/workspace/LibreChat
npm run e2e -- --grep "@demo"
```

### Run Individual Step Tests
```bash
# Step 7 only
npm run e2e -- e2e/specs/integrationsbericht/07-legal-qa.spec.ts

# Step 8 only
npm run e2e -- e2e/specs/integrationsbericht/08-text-generation.spec.ts
```

### Run Full Journey (Steps 1-8)
```bash
npm run e2e -- e2e/specs/integrationsbericht/full-journey-steps-1-8.spec.ts
```

### Run with UI (Debug Mode)
```bash
npm run e2e -- --headed --debug e2e/specs/integrationsbericht/07-legal-qa.spec.ts
```

### Generate Test Report
```bash
npm run e2e
npx playwright show-report
```

---

## Test Data Setup

### Prerequisites for Tests

**Before running tests, ensure**:
1. ✅ LibreChat running at localhost:3080
2. ✅ HIVE API running at localhost:8000
3. ✅ All 3 MCP servers configured:
   - honeycomb
   - rechtsinformationen
   - fetch
4. ✅ Test user created (or registration enabled)
5. ✅ Storage state exists: `e2e/storageState.json`

### Generate Test Storage State
```bash
cd /Users/wolfgang/workspace/LibreChat
npm run e2e:login
```

This creates authenticated session for tests.

---

## Assertions Checklist

For each step, verify:

### Step 1: Honeycomb Creation
- ✅ Agent suggests honeycomb proactively
- ✅ `create_honeycomb` tool called
- ✅ Honeycomb ID returned (format: `hc_*`)
- ✅ Honeycomb exists in HIVE API
- ✅ Honeycomb has descriptive name and context

### Step 2: Press Release Fetch
- ✅ `fetch` tool called with correct URL
- ✅ `batch_add_entities` called (NOT `add_entity_to_honeycomb`)
- ✅ At least 5 entities added (ministry + projects)
- ✅ Entities have `source_url` field
- ✅ Entities have `source_date` field
- ✅ Source URL matches press release

### Step 3: Legal Research
- ✅ `deutsche_gesetze_suchen` called
- ✅ `get_paragraph` called multiple times
- ✅ Legal entities added to honeycomb
- ✅ Paragraphs have official gesetze-im-internet.de URLs
- ✅ At least 10 legal paragraphs stored

### Step 4: Project Tracking
- ✅ ProjectStatus entities created
- ✅ Fields include: Zielerreichung, Kennzahlen, Herausforderungen
- ✅ Structure is reusable for all 34 projects

### Step 5: Report Outline
- ✅ `get_honeycomb_stats` or `get_honeycomb` called
- ✅ Outline contains 6+ chapters
- ✅ Outline includes legal foundations chapter
- ✅ Outline includes project chapter
- ✅ Outline is hierarchical (chapter/section structure)

### Step 6: Search & Analysis
- ✅ `search_entities` called
- ✅ Search returns relevant results
- ✅ Results include source attribution
- ✅ Graph structure visualization URL provided

### Step 7: Legal Q&A 🆕
- ✅ `search_entities` or similar used to find paragraphs
- ✅ Answer mentions specific paragraphs (§ 43, § 44, etc.)
- ✅ Answer includes law name (AufenthG)
- ✅ Answer includes official URL
- ✅ Answer is substantive (not just paragraph number)

### Step 8: Text Generation 🆕
- ✅ Text mentions project name
- ✅ Text includes key facts (location, organization)
- ✅ Text includes funding amount
- ✅ Text includes source citation
- ✅ Text is appropriate length (3-5 sentences minimum)
- ✅ Text matches requested style (formal/informal)

---

## Priority Order for Implementation

### **Phase 1: Critical (This Week)**
1. Create helper files (demo-helpers.ts, hive-api-client.ts)
2. Create Step 7 test (legal Q&A)
3. Create Step 8 test (text generation)
4. Fix existing test assertion (line 102: batch_add_entities)

**Effort**: 1 day
**Deliverable**: Steps 7-8 have E2E coverage

---

### **Phase 2: Enhancement (Next Week)**
1. Add HIVE API assertions to all existing tests
2. Add data quality checks (source URLs, dates)
3. Update full journey test to include Steps 7-8
4. Add MCP tool call verification helpers

**Effort**: 2-3 days
**Deliverable**: Robust E2E coverage with API validation

---

### **Phase 3: CI/CD (Later)**
1. Create dedicated test suite for demo
2. Add test reporting dashboard
3. Integrate with CI/CD pipeline
4. Add performance benchmarks

**Effort**: 2-3 days
**Deliverable**: Automated test execution and reporting

---

## Success Criteria

Tests are considered "robust" when:

- ✅ All 8 steps have dedicated test specs
- ✅ Full journey test covers all steps end-to-end
- ✅ Tests verify both UI and API state (HIVE)
- ✅ Tests validate data quality (sources, dates)
- ✅ Tests use correct MCP tools (batch_add_entities)
- ✅ Tests pass consistently (>95% success rate)
- ✅ Tests run in <20 minutes total
- ✅ Test failures are actionable (clear error messages)

---

## Troubleshooting Common Issues

### Tests Timeout
```typescript
// Increase timeout for MCP operations
test.setTimeout(180000); // 3 minutes
```

### Agent Doesn't Call Expected Tool
```typescript
// Make prompt more explicit
const message = 'Bitte nutze das batch_add_entities Tool um die Entitäten hinzuzufügen';
```

### HIVE API Connection Fails
```bash
# Verify HIVE is running
curl http://localhost:8000/health

# Check LibreChat can reach HIVE
podman exec LibreChat curl http://host.containers.internal:8000/health
```

### Flaky Tests Due to Timing
```typescript
// Use explicit waits instead of timeouts
await page.waitForSelector('[data-testid="message-content"]', {
  state: 'visible',
  timeout: 30000
});
```

### Storage State Issues
```bash
# Regenerate auth state
rm e2e/storageState.json
npm run e2e:login
```

---

## Next Steps

After implementing this plan, you'll have:
- ✅ **Robust E2E coverage** for all 8 demo steps
- ✅ **API-level validation** via HIVE client
- ✅ **Data quality checks** for sources and dates
- ✅ **Reusable helpers** for future tests
- ✅ **Confidence** that the demo works every time

**Recommended timeline**: 3-5 days for full implementation

---

## Questions?

1. Do you want to start with Step 7 or Step 8 first?
2. Should I generate the actual test files or just this plan?
3. Do you want CI/CD integration or just local test execution?
4. Should tests clean up (delete honeycombs) after completion?

---

**Last Updated**: 2025-10-14
**Status**: Implementation plan ready
**Next**: Create helper files and Step 7/8 tests
