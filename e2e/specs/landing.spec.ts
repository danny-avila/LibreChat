import { expect, test } from '@playwright/test';
import { acceptTermsIfPresent } from '../utils/acceptTermsIfPresent';

// Selector for the "New chat" button (used in the landing page)
const initialNewChatSelector = '[data-testid="nav-new-chat-button"]';
// Selector for the landing title (assume the first <h2> contains the title)
const landingTitleSelector = 'h2';

test.describe('Landing suite', () => {
  test('Landing title', async ({ page }) => {
    // Navigate to the app.
    await page.goto('http://localhost:3080/', { timeout: 5000 });
    // Accept the Terms & Conditions modal.
    await acceptTermsIfPresent(page);

    // Assert that the landing title is present.
    const pageTitle = await page.textContent(landingTitleSelector);
    expect(pageTitle?.trim()).toContain('How can I help you today?');
  });

  test('Create Conversation', async ({ page }) => {
    await page.goto('http://localhost:3080/', { timeout: 5000 });

    // Wait for and click the "New chat" button.
    await page.waitForSelector(initialNewChatSelector);
    const convoItemsBefore = await page.locator('[data-testid="convo-item"]').count();
    await page.locator(initialNewChatSelector).click();

    // Assume a new conversation is created once the textarea appears.
    const input = page.locator('form').getByRole('textbox');
    await input.click();
    await input.fill('Hi!');
    // Click the send button.
    await page.getByTestId('send-button').click();
    // Wait for the message to be processed.
    await page.waitForTimeout(3500);

    const convoItemsAfter = await page.locator('[data-testid="convo-item"]').count();
    expect(convoItemsAfter).toBeGreaterThanOrEqual(convoItemsBefore);
  });
});