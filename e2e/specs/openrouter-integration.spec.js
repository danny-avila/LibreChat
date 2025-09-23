const test = require('@playwright/test');
const { expect } = test;

test.describe('OpenRouter Integration', () => {
  test('should display OpenRouter in endpoint dropdown', async ({ page }) => {
    // Navigate to the application
    await page.goto('http://localhost:3080');

    // Look for the endpoint selector
    const endpointSelector = await page.locator('[data-testid="endpoint-selector"]');

    // Click to open dropdown
    await endpointSelector.click();

    // Check if OpenRouter is in the list
    const openrouterOption = await page.locator('text=OpenRouter');
    await expect(openrouterOption).toBeVisible();
  });

  test('should have correct endpoint type configuration', async ({ page }) => {
    // Fetch the endpoints configuration
    const response = await page.request.get('http://localhost:3080/api/endpoints');
    const endpoints = await response.json();

    // Verify OpenRouter exists and has correct type
    expect(endpoints.openrouter).toBeTruthy();
    expect(endpoints.openrouter.type).toBe('openrouter');
    expect(endpoints.openrouter.modelDisplayLabel).toBe('OpenRouter');
  });

  test('should not route to OpenAI when OpenRouter is selected', async ({ page }) => {
    // Navigate to the application
    await page.goto('http://localhost:3080');

    // Select OpenRouter endpoint (if selector exists)
    const endpointSelector = await page.locator('[data-testid="endpoint-selector"]');
    if ((await endpointSelector.count()) > 0) {
      await endpointSelector.click();
      const openrouterOption = await page.locator('text=OpenRouter');
      if ((await openrouterOption.count()) > 0) {
        await openrouterOption.click();
      }
    }

    // Listen for network requests
    const requestPromise = page.waitForRequest((request) => {
      const url = request.url();
      // Check if any request goes to OpenAI API
      if (url.includes('api.openai.com')) {
        throw new Error('Request incorrectly routed to OpenAI API!');
      }
      // Check if request goes to OpenRouter endpoints
      return url.includes('/api/edit/openrouter') || url.includes('/api/ask/openrouter');
    });

    // Send a test message
    const messageInput = await page.locator(
      '[data-testid="message-input"], textarea[placeholder*="Send"]',
    );
    await messageInput.fill('What AI model are you?');

    // Send the message
    await page.keyboard.press('Enter');

    // Wait for the request and verify it's to OpenRouter
    const request = await requestPromise;
    expect(request.url()).toContain('openrouter');
    expect(request.url()).not.toContain('openai');
  });

  test('should use OpenRouter client when endpoint type is openrouter', async ({ page }) => {
    // This test verifies the backend routing logic
    const response = await page.request.post('http://localhost:3080/api/edit/openrouter', {
      data: {
        text: 'Test message',
        endpoint: 'openrouter',
        model: 'meta-llama/llama-3.2-1b-instruct',
        conversationId: 'test-' + Date.now(),
        parentMessageId: '00000000-0000-0000-0000-000000000000',
        endpointOption: {
          endpoint: 'openrouter',
          endpointType: 'openrouter', // Critical: this should be 'openrouter'
          model: 'meta-llama/llama-3.2-1b-instruct',
        },
      },
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Check that we get a valid response (not an OpenAI error)
    expect(response.status()).toBeLessThan(400);
  });
});
