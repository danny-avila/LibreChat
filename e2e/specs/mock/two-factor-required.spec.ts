import { expect, test } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('required two-factor enrollment', () => {
  test('completes setup and requires backup-code download', async ({ page }) => {
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          twoFAPending: true,
          twoFASetupRequired: true,
          tempToken: 'setup-token',
        }),
      });
    });
    await page.route('**/api/auth/2fa/setup', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          otpauthUrl: 'otpauth://totp/LibreChat:user@example.com?secret=ABC123&issuer=LibreChat',
          backupCodes: ['backup01', 'backup02'],
        }),
      });
    });
    await page.route('**/api/auth/2fa/setup/confirm', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ token: 'auth-token', user: { twoFactorEnabled: true } }),
      });
    });

    await page.goto('/login');
    await page.getByRole('textbox', { name: 'Email' }).fill('user@example.com');
    await page.getByRole('textbox', { name: 'Password' }).fill('password');
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page).toHaveURL(/\/login\/2fa\/setup\?tempToken=setup-token$/);
    const generateButton = page.getByRole('button', { name: 'Generate QR Code' });
    const setupCardBox = await generateButton.locator('..').boundingBox();
    expect(setupCardBox?.width).toBeGreaterThanOrEqual(430);
    await generateButton.click();

    await expect(page.getByRole('img', { name: 'Scan QR Code' })).toBeVisible();
    await expect(page.getByLabel('Secret Key')).toHaveValue('ABC123');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByLabel('Enter your 2FA code to continue').fill('123456');
    await page.getByRole('button', { name: 'Verify' }).click();

    const completeButton = page.getByRole('button', { name: 'Complete Setup' });
    await expect(completeButton).toBeDisabled();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download Backup Codes' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('backup-codes.txt');
    await expect(completeButton).toBeEnabled();
  });
});
