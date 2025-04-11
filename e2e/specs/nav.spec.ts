import { expect, test } from '@playwright/test';
import { acceptTermsIfPresent } from '../utils/acceptTermsIfPresent';

test.describe('Navigation suite', () => {
  test('Navigation bar', async ({ page }) => {
    await page.goto('http://localhost:3080/', { timeout: 5000 });
    await acceptTermsIfPresent(page);
    await page.getByTestId('nav-user').click();

    // Verify that the navigation user button is visible.
    expect(await page.getByTestId('nav-user').isVisible()).toBeTruthy();
  });

  test('Settings modal', async ({ page }) => {
    await page.goto('http://localhost:3080/', { timeout: 5000 });

    // Wait for the landing page heading to ensure the page has fully rendered.
    await page
      .getByRole('heading', { name: 'How can I help you today?' })
      .waitFor({ state: 'visible', timeout: 5000 });

    // Wait for the nav-user element to be visible and add a short delay.
    await page.waitForSelector('[data-testid="nav-user"]', { state: 'visible', timeout: 5000 });
    await page.waitForTimeout(500);

    // Open the nav-user popover.
    await page.getByTestId('nav-user').click();

    // Wait for the popover container (dialog) to appear.
    const popover = page.locator('[data-dialog][role="listbox"]');
    await popover.waitFor({ state: 'visible', timeout: 5000 });

    // Within the popover, click on the Settings option using its accessible role.
    const settingsOption = popover.getByRole('option', { name: 'Settings' });
    await settingsOption.waitFor({ state: 'visible', timeout: 5000 });
    await settingsOption.click();

    // Verify that a theme selector exists.
    const modalTheme = page.getByTestId('theme-selector');
    expect(await modalTheme.count()).toBeGreaterThan(0);

    // Helper function to change the theme.
    async function changeMode(theme: string) {
      await page.waitForSelector('[data-testid="theme-selector"]', { state: 'visible' });
      await modalTheme.click();
      await page.click(`[data-theme="${theme}"]`);
      // Wait for the theme change to take effect.
      await page.waitForTimeout(1000);
      // Check that the <html> element has the corresponding theme class.
      const hasTheme = await page.$eval(
        'html',
        (el, theme) => el.classList.contains(theme.toLowerCase()),
        theme
      );
      expect(hasTheme).toBeTruthy();
    }

    await changeMode('dark');
    await changeMode('light');
  });
});