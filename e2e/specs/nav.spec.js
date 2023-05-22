import { expect, test } from '@playwright/test';

test.describe('Navigation suite', () => {
  let myBrowser;

  test.beforeEach(async ({ browser }) => {
    myBrowser = await browser.newContext({
      storageState: 'e2e/auth.json',
    });
  });

  test('Navigation bar', async () => {
    const page = await myBrowser.newPage();
    await page.goto('http://localhost:3080/');

    await page.locator('[id="headlessui-menu-button-\\:r0\\:"]').click();
    const navBar = await page.locator('[id="headlessui-menu-button-\\:r0\\:"]').isVisible();
    expect(navBar).toBeTruthy();
  });

  test('Settings modal', async () => {
    const page = await myBrowser.newPage();
    await page.goto('http://localhost:3080/');
    await page.locator('[id="headlessui-menu-button-\\:r0\\:"]').click();
    await page.getByText('Settings').click();

    const modal = await page.getByRole('dialog', { name: 'Settings' }).isVisible();
    expect(modal).toBeTruthy();

    const modalTitle = await page.getByRole('heading', { name: 'Settings' }).textContent();
    expect(modalTitle.length).toBeGreaterThan(0);
    expect(modalTitle).toEqual('Settings');

    const modalTabList = await page.getByRole('tablist', { name: 'Settings' }).isVisible();
    expect(modalTabList).toBeTruthy();

    const generalTabPanel = await page.getByRole('tabpanel', { name: 'General' }).isVisible();
    expect(generalTabPanel).toBeTruthy();

    const modalClearConvos = await page.getByRole('button', { name: 'Clear' }).isVisible();
    expect(modalClearConvos).toBeTruthy();

    async function changeMode(theme) {
      const modalTheme = await page.getByRole('combobox');
      expect(modalTheme.isVisible()).toBeTruthy();
      // change the value to 'dark' and 'light' and see if the theme changes
      await modalTheme.selectOption({ label: theme });
      await page.waitForTimeout(1000);


      // Check if the HTML element has the theme class
      const html = await page.$eval('html', (element, theme) => element.classList.contains(theme.toLowerCase()), theme);
      expect(html).toBeTruthy();
    }

    await changeMode('Dark');
    await changeMode('Light');
  });
});
