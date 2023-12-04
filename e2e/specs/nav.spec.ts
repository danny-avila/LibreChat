import { expect, test } from '@playwright/test';

test.describe('Navigation suite', () => {
  test('Navigation bar', async ({ page }) => {
    await page.goto('http://localhost:3080/', { timeout: 5000 });

    await page.getByTestId('nav-user').click();
    const navSettings = await page.getByTestId('nav-user').isVisible();
    expect(navSettings).toBeTruthy();
  });

  test('Settings modal', async ({ page }) => {
    await page.goto('http://localhost:3080/', { timeout: 5000 });
    await page.getByTestId('nav-user').click();
    await page.getByText('Settings').click();

    const modal = await page.getByRole('dialog', { name: 'Settings' }).isVisible();
    expect(modal).toBeTruthy();

    const modalTitle = await page.getByRole('heading', { name: 'Settings' }).textContent();
    expect(modalTitle?.length).toBeGreaterThan(0);
    expect(modalTitle).toEqual('Settings');

    const modalTabList = await page.getByRole('tablist', { name: 'Settings' }).isVisible();
    expect(modalTabList).toBeTruthy();

    const generalTabPanel = await page.getByRole('tabpanel', { name: 'General' }).isVisible();
    expect(generalTabPanel).toBeTruthy();

    const modalClearConvos = await page.getByRole('button', { name: 'Clear' }).isVisible();
    expect(modalClearConvos).toBeTruthy();

    const modalTheme = page.getByTestId('theme-selector');
    expect(modalTheme).toBeTruthy();

    async function changeMode(theme: string) {
      // Ensure Element Visibility:
      await page.waitForSelector('[data-testid="theme-selector"]');
      await modalTheme.click();

      await page.click(`[data-theme="${theme}"]`);

      // Wait for the theme change
      await page.waitForTimeout(1000);

      // Check if the HTML element has the theme class
      const html = await page.$eval(
        'html',
        (element, selectedTheme) => element.classList.contains(selectedTheme.toLowerCase()),
        theme,
      );
      expect(html).toBeTruthy();
    }

    await changeMode('dark');
    await changeMode('light');
  });
});
