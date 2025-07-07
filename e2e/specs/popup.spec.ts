import { expect, test } from '@playwright/test';
import { acceptTermsIfPresent } from '../utils/acceptTermsIfPresent';

const initialNewChatSelector = '[data-testid="nav-new-chat-button"]';

test.describe('Endpoints Presets suite', () => {
  test('Endpoints Suite', async ({ page }) => {
    // Navigate to the application.
    await page.goto('http://localhost:3080/', { timeout: 5000 });

    // Accept the Terms & Conditions modal if needed.
    await acceptTermsIfPresent(page);

    // Click the New Chat button.
    await page.locator(initialNewChatSelector).click();

    // Open the endpoint menu by clicking the combobox with label "LLM Endpoint Menu".
    const llmComboBox = page.getByRole('combobox', { name: 'LLM Endpoint Menu' });
    await llmComboBox.click();

    // Wait for the Azure OpenAI endpoint item to appear using its test ID.
    const azureEndpoint = page.getByTestId('endpoint-item-azureOpenAI');
    await azureEndpoint.waitFor({ state: 'visible', timeout: 5000 });

    // Verify that the Azure endpoint item is visible.
    expect(await azureEndpoint.isVisible()).toBeTruthy();

    // Optionally, close the endpoint menu by clicking the New Chat button again.
    await page.locator(initialNewChatSelector).click();
  });
});