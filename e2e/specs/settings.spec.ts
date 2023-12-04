import { expect, test } from '@playwright/test';

test.describe('Settings suite', () => {
  test('Last Bing settings', async ({ page }) => {
    await page.goto('http://localhost:3080/', { timeout: 5000 });
    await page.evaluate(() =>
      window.localStorage.setItem(
        'lastConversationSetup',
        JSON.stringify({
          conversationId: 'new',
          title: 'New Chat',
          endpoint: 'bingAI',
          createdAt: '',
          updatedAt: '',
          jailbreak: false,
          context: null,
          systemMessage: null,
          toneStyle: 'creative',
          jailbreakConversationId: null,
          conversationSignature: null,
          clientId: null,
          invocationId: 1,
        }),
      ),
    );
    await page.goto('http://localhost:3080/', { timeout: 5000 });

    const initialLocalStorage = await page.evaluate(() => window.localStorage);
    const lastConvoSetup = JSON.parse(initialLocalStorage.lastConversationSetup);
    expect(lastConvoSetup.endpoint).toEqual('bingAI');

    const newTopicButton = page.getByTestId('new-conversation-menu');
    await newTopicButton.click();

    // includes the icon + endpoint names in obj property
    const endpointItem = page.getByTestId('endpoint-item-bingAI');
    await endpointItem.click();

    await page.getByTestId('text-input').click();
    const button1 = page.getByRole('button', { name: 'Mode: BingAI' });
    const button2 = page.getByRole('button', { name: 'Mode: Sydney' });

    try {
      await button1.click({ timeout: 100 });
    } catch (e) {
      // console.log('Bing button', e);
    }

    try {
      await button2.click({ timeout: 100 });
    } catch (e) {
      // console.log('Sydney button', e);
    }
    await page.getByRole('option', { name: 'Sydney' }).click();
    await page.getByRole('tab', { name: 'Balanced' }).click();

    // Change Endpoint to see if settings will persist
    await newTopicButton.click();
    await page.getByRole('menuitemradio', { name: 'ChatGPT OpenAI' }).click();

    // Close endpoint menu & re-select BingAI
    await page.getByTestId('text-input').click();
    await newTopicButton.click();
    await endpointItem.click();

    // Check if the settings persisted
    const localStorage = await page.evaluate(() => window.localStorage);
    const lastBingSettings = JSON.parse(localStorage.lastBingSettings);
    const { jailbreak, toneStyle } = lastBingSettings;
    expect(jailbreak).toBeTruthy();
    expect(toneStyle).toEqual('balanced');
    const button = page.getByRole('button', { name: 'Mode: Sydney' });
    expect(button.count()).toBeTruthy();
  });
});
