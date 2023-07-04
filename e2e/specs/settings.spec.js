import { expect, test } from '@playwright/test';

test.describe('Settings suite', () => {
  test('Last Bing settings', async ({ page }) => {
    await page.goto('http://localhost:3080/');
    await page.getByRole('button', { name: 'New Topic' }).click();

    // includes the icon + endpoint names in obj property
    const endpointItem = await page.getByRole('menuitemradio', { name: 'BingAI Bing' })
    await endpointItem.click();

    await page.getByRole('button', { name: 'New Topic' }).click();
    // Check if the active class is set on the selected endpoint
    expect(await endpointItem.getAttribute('class')).toContain('active');
  });
});
