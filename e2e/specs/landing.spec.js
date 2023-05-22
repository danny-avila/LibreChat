import { expect, test } from '@playwright/test';

test.describe('Landing suite', () => {
  let myBrowser;

  test.beforeEach(async ({ browser }) => {
    myBrowser = await browser.newContext({
      storageState: 'e2e/auth.json',
    });
  });

  test('Landing title', async () => {
    const page = await myBrowser.newPage();
    await page.goto('http://localhost:3080/');
    const pageTitle = await page.textContent('#landing-title')
    expect(pageTitle.length).toBeGreaterThan(0);
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

    const modalTheme = await page.getByRole('combobox').isVisible();
    expect(modalTheme).toBeTruthy();
  });
});
