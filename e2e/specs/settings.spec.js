import { expect, test } from '@playwright/test';

test.describe('Settings suite', () => {
  test('Last Bing settings', async ({ page }) => {
    await page.goto('http://localhost:3080/');
    const newTopicButton = await page.getByRole('button', { name: 'New Topic' });
    await newTopicButton.click();

    // includes the icon + endpoint names in obj property
    const endpointItem = await page.getByRole('menuitemradio', { name: 'BingAI Bing' });
    await endpointItem.click();

    await page.getByTestId('text-input').click();
    const button1 = await page.getByRole('button', { name: 'Mode: BingAI' });
    const button2 = await page.getByRole('button', { name: 'Mode: Sydney' });

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
    const button = await page.getByRole('button', { name: 'Mode: Sydney' });
    expect(button.count()).toBeTruthy();
  });
});
