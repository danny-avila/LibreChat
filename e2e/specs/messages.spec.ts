// // messaging.spec.ts
// import { expect, test } from '@playwright/test';
// import type { Response, Page, BrowserContext } from '@playwright/test';
// import { acceptTermsIfPresent } from '../utils/acceptTermsIfPresent';
//
// const basePath = 'http://localhost:3080/c/';
// const initialUrl = `${basePath}new`;
// function isUUID(uuid: string) {
//   const regex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
//   return regex.test(uuid);
// }
// const initialNewChatSelector = '[data-testid="nav-new-chat-button"]';
//
// const endpoint = 'openAI'; // adjust as needed
// const waitForServerStream = async (response: Response) => {
//   const endpointCheck =
//     response.url().includes(`/api/ask/${endpoint}`) ||
//     response.url().includes(`/api/edit/${endpoint}`);
//   return endpointCheck && response.status() === 200;
// };
//
// /**
//  * Clears conversations by:
//  *  1. Navigating to the initial URL and accepting the Terms modal (if needed).
//  *  2. Clicking the nav-user button to open the popover.
//  *  3. Waiting for and clicking the "Settings" option.
//  *  4. In the Settings dialog, selecting the "Data controls" tab.
//  *  5. Locating the container with the "Clear all chats" label and clicking its Delete button.
//  *  6. Waiting for the confirmation dialog (with accessible name "Confirm Clear") to appear,
//  *     and then clicking its Delete button.
//  *  7. Finally, closing the settings dialog.
//  */
// async function clearConvos(page: Page) {
//   // Navigate to the initial URL.
//   await page.goto(initialUrl, { timeout: 5000 });
//
//   // Accept the Terms modal if it appears.
//   await acceptTermsIfPresent(page);
//
//   // Open the nav-user popover.
//   await page.getByTestId('nav-user').click();
//   // Wait for the popover container to appear.
//   await page.waitForSelector('[data-dialog][role="listbox"]', { state: 'visible', timeout: 5000 });
//
//   // Wait for the "Settings" option to be visible and click it.
//   const settingsOption = page.getByText('Settings');
//   await settingsOption.waitFor({ state: 'visible', timeout: 5000 });
//   await settingsOption.click();
//
//   // In the Settings dialog, click on the "Data controls" tab.
//   const dataControlsTab = page.getByRole('tab', { name: 'Data controls' });
//   await dataControlsTab.waitFor({ state: 'visible', timeout: 5000 });
//   await dataControlsTab.click();
//
//   // Locate the "Clear all chats" label.
//   const clearChatsLabel = page.getByText('Clear all chats');
//   await clearChatsLabel.waitFor({ state: 'visible', timeout: 5000 });
//
//   // Get the parent container of the label.
//   const parentContainer = clearChatsLabel.locator('xpath=..');
//
//   // Locate the Delete button within that container.
//   const deleteButtonInContainer = parentContainer.locator('button', { hasText: 'Delete' });
//   await deleteButtonInContainer.waitFor({ state: 'visible', timeout: 5000 });
//   await deleteButtonInContainer.click();
//
//   // Wait for the confirmation dialog with the accessible name "Confirm Clear" to appear.
//   const confirmDialog = page.getByRole('dialog', { name: 'Confirm Clear' });
//   await confirmDialog.waitFor({ state: 'visible', timeout: 5000 });
//
//   // In the confirmation dialog, click the Delete button.
//   const confirmDeleteButton = page.getByRole('button', { name: 'Delete' });
//   await confirmDeleteButton.waitFor({ state: 'visible', timeout: 5000 });
//   await confirmDeleteButton.click();
//
//   // Close the settings dialog.
//   await page.getByRole('button', { name: 'Close', exact: true }).click();
// }
//
// let beforeAfterAllContext: BrowserContext;
// test.beforeAll(async ({ browser }) => {
//   console.log('Clearing conversations before message tests.');
//   beforeAfterAllContext = await browser.newContext();
//   const page = await beforeAfterAllContext.newPage();
//   await clearConvos(page);
//   await page.close();
// });
//
// test.describe('Messaging suite', () => {
//   test('textbox should be focused after generation, test expected navigation, & test editing messages', async ({ page }) => {
//     test.setTimeout(120000);
//     const message = 'hi';
//
//     // Navigate to the page.
//     await page.goto(initialUrl, { timeout: 5000 });
//     // Accept the Terms modal if needed.
//     await acceptTermsIfPresent(page);
//
//     // Click the "New chat" button.
//     await page.locator(initialNewChatSelector).click();
//
//     // Assume endpoint selection is done automatically.
//     const input = await page.locator('form').getByRole('textbox');
//     await input.click();
//     await input.fill(message);
//
//     // Press Enter to send the message and wait for the API response.
//     const [response] = (await Promise.all([
//       page.waitForResponse(waitForServerStream),
//       input.press('Enter'),
//     ])) as [Response];
//     const responseBody = await response.body();
//     expect(responseBody.toString()).toContain('"final":true');
//
//     // Check that the input remains focused.
//     await page.waitForTimeout(250);
//     const isTextboxFocused = await page.evaluate(() =>
//       document.activeElement === document.querySelector('[data-testid="text-input"]')
//     );
//     expect(isTextboxFocused).toBeTruthy();
//
//     // Click the "New chat" button to clear the conversation.
//     await page.locator(initialNewChatSelector).click();
//     expect(page.url()).toBe(initialUrl);
//
//     // Open the first conversation by clicking its icon.
//     await page.locator('[data-testid="convo-icon"]').first().click({ timeout: 5000 });
//     const finalUrl = page.url();
//     const conversationId = finalUrl.split(basePath).pop() ?? '';
//     expect(isUUID(conversationId)).toBeTruthy();
//
//     // Simulate editing the conversation title.
//     const convoMenuButton = await page.getByRole('button', { name: /Conversation Menu Options/i });
//     await convoMenuButton.click();
//     const renameOption = await page.getByRole('menuitem', { name: 'Rename' });
//     await renameOption.click();
//     // Assume a text editor appears.
//     const textEditor = page.locator('[data-testid="message-text-editor"]');
//     await textEditor.click();
//     const editText = 'All work and no play makes Johnny a poor boy';
//     await textEditor.fill(editText);
//     // Click the Save button.
//     await page.getByRole('button', { name: 'Save', exact: true }).click();
//
//     // Verify that the new title appears in the conversation list.
//     const updatedTitle = await page.getByText(editText).first().textContent();
//     expect(updatedTitle).toContain(editText);
//   });
//
//   test('message should stop and continue', async ({ page }) => {
//     const message = 'write me a 10 stanza poem about space';
//     await page.goto(initialUrl, { timeout: 5000 });
//     await acceptTermsIfPresent(page);
//     await page.locator(initialNewChatSelector).click();
//
//     // Assume the endpoint is selected automatically.
//     const input = await page.locator('form').getByRole('textbox');
//     await input.click();
//     await input.fill(message);
//     await Promise.all([
//       page.waitForResponse(waitForServerStream),
//       input.press('Enter'),
//     ]);
//
//     // Wait briefly then simulate stopping the generation.
//     await page.waitForTimeout(250);
//     await page.getByRole('button', { name: 'Stop' }).click();
//
//     // Then continue generation.
//     await Promise.all([
//       page.waitForResponse(waitForServerStream),
//       page.getByTestId('continue-generation-button').click(),
//     ]);
//     // Check that a "Regenerate" button appears.
//     const regenerateButton = await page.getByRole('button', { name: 'Regenerate' });
//     expect(await regenerateButton.count()).toBeGreaterThan(0);
//
//     // Clear the conversation if needed.
//     await page.locator('[data-testid="convo-item"]')
//       .getByRole('button')
//       .nth(1)
//       .click();
//   });
//
//   test('Page navigations', async ({ page }) => {
//     await page.goto(initialUrl, { timeout: 5000 });
//     await acceptTermsIfPresent(page);
//     await page.locator('[data-testid="convo-icon"]').first().click({ timeout: 5000 });
//     const currentUrl = page.url();
//     const conversationId = currentUrl.split(basePath).pop() ?? '';
//     expect(isUUID(conversationId)).toBeTruthy();
//     await page.locator(initialNewChatSelector).click();
//     expect(page.url()).toBe(initialUrl);
//   });
// });