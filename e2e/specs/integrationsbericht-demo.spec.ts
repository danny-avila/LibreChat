import { expect, test } from '@playwright/test';
import type { Response, Page } from '@playwright/test';

const basePath = 'http://localhost:3080/c/';
const initialUrl = `${basePath}new`;

const waitForAgentStream = async (response: Response) => {
  const endpointCheck = response.url().includes(`/api/agents`);
  return endpointCheck && response.status() === 200;
};

test.describe('Integrationsbericht BW 2025 Demo Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(initialUrl, { timeout: 10000 });
  });

  test.afterEach(async ({ page }) => {
    await page.close();
  });

  test('Complete demo flow: Create honeycomb, fetch press release, add legal research', async ({
    page,
  }) => {
    test.setTimeout(180000); // 3 minutes for full flow with MCP calls

    // Step 1: Select Agents endpoint
    await page.locator('#new-conversation-menu').click();
    await page.locator('#agents').click();

    // Step 2: Start the project - should trigger proactive honeycomb suggestion
    const initialMessage =
      'Ich erstelle den Integrationsbericht Baden-Württemberg 2025 für die Veröffentlichung im Q1 2026. ' +
      'Das Kernstück ist ein Update zu 34 lokalen Integrationsprojekten. Hier ist die Pressemitteilung dazu:\n\n' +
      'https://sozialministerium.baden-wuerttemberg.de/de/service/presse/pressemitteilung/pid/land-foerdert-34-lokale-integrationsprojekte-mit-rund-18-millionen-euro';

    await page.locator('form').getByRole('textbox').click();
    await page.locator('form').getByRole('textbox').fill(initialMessage);

    let responsePromise = page.waitForResponse(waitForAgentStream);
    await page.locator('form').getByRole('textbox').press('Enter');
    let response = await responsePromise;

    // Verify response includes honeycomb creation
    let responseBody = await response.text();
    expect(responseBody).toContain('create_honeycomb');

    // Wait for response to complete
    await page.waitForSelector('[data-testid="continue-generation-button"]', {
      state: 'detached',
      timeout: 60000
    });

    // Step 3: Confirm reading press release and extracting projects
    await page.waitForTimeout(1000); // Let UI settle
    await page.locator('form').getByRole('textbox').click();
    await page.locator('form').getByRole('textbox').fill('Ja, bitte lies die Pressemitteilung und erfasse die wichtigsten Informationen.');

    responsePromise = page.waitForResponse(waitForAgentStream);
    await page.locator('form').getByRole('textbox').press('Enter');
    response = await responsePromise;

    // Verify fetch tool was called
    responseBody = await response.text();
    expect(responseBody).toContain('fetch');

    await page.waitForSelector('[data-testid="continue-generation-button"]', {
      state: 'detached',
      timeout: 60000
    });

    // Step 4: Request legal research
    await page.waitForTimeout(1000);
    await page.locator('form').getByRole('textbox').click();
    await page.locator('form').getByRole('textbox').fill(
      'Welche Gesetze regeln Integration in Baden-Württemberg? Ich brauche die rechtliche Grundlage für Kapitel 2 des Berichts.'
    );

    responsePromise = page.waitForResponse(waitForAgentStream);
    await page.locator('form').getByRole('textbox').press('Enter');
    response = await responsePromise;

    // Verify legal search was called
    responseBody = await response.text();
    expect(responseBody).toContain('deutsche_gesetze_suchen');

    await page.waitForSelector('[data-testid="continue-generation-button"]', {
      state: 'detached',
      timeout: 60000
    });

    // Step 5: Confirm adding paragraphs to honeycomb
    await page.waitForTimeout(1000);
    await page.locator('form').getByRole('textbox').click();
    await page.locator('form').getByRole('textbox').fill('Ja, füge die zentralen Paragraphen hinzu.');

    responsePromise = page.waitForResponse(waitForAgentStream);
    await page.locator('form').getByRole('textbox').press('Enter');
    response = await responsePromise;

    // Verify entities are being added
    responseBody = await response.text();
    expect(responseBody).toContain('add_entity_to_honeycomb');

    await page.waitForSelector('[data-testid="continue-generation-button"]', {
      state: 'detached',
      timeout: 90000
    });

    // Step 6: Request report outline
    await page.waitForTimeout(1000);
    await page.locator('form').getByRole('textbox').click();
    await page.locator('form').getByRole('textbox').fill(
      'Erstelle eine Gliederung für den Integrationsbericht basierend auf den Daten, die wir bisher gesammelt haben.'
    );

    responsePromise = page.waitForResponse(waitForAgentStream);
    await page.locator('form').getByRole('textbox').press('Enter');
    response = await responsePromise;

    // Verify honeycomb structure is analyzed
    responseBody = await response.text();
    expect(responseBody).toContain('get_honeycomb');

    await page.waitForSelector('[data-testid="continue-generation-button"]', {
      state: 'detached',
      timeout: 60000
    });

    // Verify the conversation contains key elements
    const pageContent = await page.content();

    // Check for honeycomb creation confirmation
    expect(pageContent).toContain('Integrationsbericht');

    // Check that the final message is visible (outline with chapters)
    const lastMessage = await page.locator('[data-testid="message-content"]').last().innerText();
    expect(lastMessage).toContain('Gliederung');

    console.log('✅ Demo flow completed successfully!');
  });

  test('Search functionality: Find Ehrenamt projects', async ({ page }) => {
    test.setTimeout(120000);

    // This test assumes a honeycomb with projects already exists
    await page.locator('#new-conversation-menu').click();
    await page.locator('#agents').click();

    const searchMessage = 'Finde alle Projekte im Honeycomb "Integrationsbericht Baden-Württemberg 2025", die sich mit Ehrenamt beschäftigen.';

    await page.locator('form').getByRole('textbox').click();
    await page.locator('form').getByRole('textbox').fill(searchMessage);

    const responsePromise = page.waitForResponse(waitForAgentStream);
    await page.locator('form').getByRole('textbox').press('Enter');
    const response = await responsePromise;

    // Verify search was executed
    const responseBody = await response.text();
    expect(responseBody).toContain('search_entities');

    await page.waitForSelector('[data-testid="continue-generation-button"]', {
      state: 'detached',
      timeout: 60000
    });

    // Verify results mention Ehrenamt
    const pageContent = await page.content();
    expect(pageContent).toContain('Ehrenamt');

    console.log('✅ Search test completed successfully!');
  });

  test('Proactive honeycomb suggestion on complex task', async ({ page }) => {
    test.setTimeout(90000);

    await page.locator('#new-conversation-menu').click();
    await page.locator('#agents').click();

    // Complex task that should trigger proactive honeycomb suggestion
    const complexMessage =
      'Ich muss 50 wissenschaftliche Paper zu Klimawandel organisieren und kategorisieren. ' +
      'Jedes Paper hat Autoren, Veröffentlichungsdatum, Keywords und Zitate.';

    await page.locator('form').getByRole('textbox').click();
    await page.locator('form').getByRole('textbox').fill(complexMessage);

    const responsePromise = page.waitForResponse(waitForAgentStream);
    await page.locator('form').getByRole('textbox').press('Enter');
    const response = await responsePromise;

    await page.waitForSelector('[data-testid="continue-generation-button"]', {
      state: 'detached',
      timeout: 60000
    });

    // Check if KI proactively suggested a honeycomb
    const lastMessage = await page.locator('[data-testid="message-content"]').last().innerText();
    expect(lastMessage.toLowerCase()).toMatch(/honeycomb|wissensgraph|knowledge graph/);

    console.log('✅ Proactive suggestion test completed!');
  });

  test('Web fetch functionality for press release', async ({ page }) => {
    test.setTimeout(90000);

    await page.locator('#new-conversation-menu').click();
    await page.locator('#agents').click();

    const fetchMessage =
      'Bitte lies diese Pressemitteilung und fasse die wichtigsten Punkte zusammen:\n\n' +
      'https://sozialministerium.baden-wuerttemberg.de/de/service/presse/pressemitteilung/pid/land-foerdert-34-lokale-integrationsprojekte-mit-rund-18-millionen-euro';

    await page.locator('form').getByRole('textbox').click();
    await page.locator('form').getByRole('textbox').fill(fetchMessage);

    const responsePromise = page.waitForResponse(waitForAgentStream);
    await page.locator('form').getByRole('textbox').press('Enter');
    const response = await responsePromise;

    // Verify fetch was called
    const responseBody = await response.text();
    expect(responseBody).toContain('fetch');

    await page.waitForSelector('[data-testid="continue-generation-button"]', {
      state: 'detached',
      timeout: 60000
    });

    // Check if response contains info from press release
    const lastMessage = await page.locator('[data-testid="message-content"]').last().innerText();
    expect(lastMessage).toContain('Projekt');

    console.log('✅ Fetch test completed!');
  });

  test('Legal research with rechtsinformationen-bund-de', async ({ page }) => {
    test.setTimeout(90000);

    await page.locator('#new-conversation-menu').click();
    await page.locator('#agents').click();

    const legalMessage = 'Suche nach Integrationsgesetzen in Deutschland.';

    await page.locator('form').getByRole('textbox').click();
    await page.locator('form').getByRole('textbox').fill(legalMessage);

    const responsePromise = page.waitForResponse(waitForAgentStream);
    await page.locator('form').getByRole('textbox').press('Enter');
    const response = await responsePromise;

    // Verify legal search was called
    const responseBody = await response.text();
    expect(responseBody).toContain('deutsche_gesetze_suchen');

    await page.waitForSelector('[data-testid="continue-generation-button"]', {
      state: 'detached',
      timeout: 60000
    });

    // Check if response mentions relevant laws
    const lastMessage = await page.locator('[data-testid="message-content"]').last().innerText();
    expect(lastMessage).toMatch(/SGB|AufenthG|IntG|Gesetz/);

    console.log('✅ Legal research test completed!');
  });
});
