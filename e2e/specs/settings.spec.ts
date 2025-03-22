// import { expect, test } from '@playwright/test';
//
// const initialNewChatSelector = '[data-testid="nav-new-chat-button"]';
//
// test.describe('Settings suite', () => {
//   test('Last OpenAI settings', async ({ page }) => {
//     await page.goto('http://localhost:3080/', { timeout: 5000 });
//     // Pre-populate localStorage with a last conversation setup.
//     await page.evaluate(() =>
//       window.localStorage.setItem(
//         'lastConversationSetup',
//         JSON.stringify({
//           conversationId: 'new',
//           title: 'New Chat',
//           endpoint: 'openAI',
//           createdAt: '',
//           updatedAt: '',
//         })
//       )
//     );
//     await page.goto('http://localhost:3080/', { timeout: 5000 });
//     const ls = await page.evaluate(() => window.localStorage);
//     const lastConvoSetup = JSON.parse(ls.lastConversationSetup || '{}');
//     expect(lastConvoSetup.endpoint).toEqual('openAI');
//
//     // Click the new chat button.
//     await page.locator(initialNewChatSelector).click();
//     // Instead of an endpoint item (which we no longer use), check that the LLM Endpoint Menu shows the correct default.
//     const llmButton = page.getByRole('button', { name: /LLM Endpoint Menu/i });
//     const buttonText = await llmButton.textContent();
//     expect(buttonText?.trim()).toContain('openAI'); // Adjust this expectation as needed
//
//     // Open the account settings dropdown and simulate changing settings.
//     await page.getByTestId('nav-user').click();
//     await page.getByText('Settings').click();
//     // Simulate clicking the "Data controls" tab (if it exists)
//     const dataControlsTab = page.getByRole('tab', { name: 'Data controls' });
//     expect(await dataControlsTab.count()).toBeGreaterThan(0);
//     await dataControlsTab.click();
//     // Simulate revoking a key – if a "Revoke" button exists.
//     const revokeButton = page.getByRole('button', { name: 'Revoke' });
//     expect(await revokeButton.count()).toBeGreaterThan(0);
//     await revokeButton.click();
//     await page.getByRole('button', { name: 'Confirm Action' }).click();
//     // Finally, close the settings.
//     await page.getByRole('button', { name: 'Close' }).click();
//
//     // Check that after these actions, the endpoint defaults remain.
//     const llmButtonTextAfter = await llmButton.textContent();
//     expect(llmButtonTextAfter?.trim()).toContain('openAI');
//   });
// });