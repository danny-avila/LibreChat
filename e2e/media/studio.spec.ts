import { expect, test } from '@playwright/test';

test('sidebar studio queues, restores, refines and hands an original to chat', async ({ page }) => {
  await page.goto('/c/new');
  await page.getByRole('button', { name: 'Media Studio', exact: true }).first().click();
  await expect(page).toHaveURL(/\/studio$/);
  await expect(page.getByRole('heading', { name: 'Media Studio', exact: true })).toBeVisible();
  const prompt = page.getByRole('textbox', { name: 'Describe what you want to create or change' });
  await prompt.fill('A local observatory fixture');
  await page.getByRole('button', { name: 'Add to queue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A local observatory fixture' })).toBeVisible();
  await page.getByRole('heading', { name: 'A local observatory fixture' }).click();
  await expect(page).toHaveURL(/\/studio\/threads\//);
  await expect(page.getByRole('link', { name: 'Download original' })).toBeVisible({
    timeout: 20_000,
  });
  const image = page.locator('figure img').first();
  await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBe(320);
  const threadURL = page.url();
  await page.reload();
  await expect(page.getByRole('link', { name: 'Download original' })).toBeVisible();
  await page.getByRole('button', { name: 'Refine this result' }).click();
  await prompt.fill('Make the observatory warmer');
  await page.getByRole('button', { name: 'Add to queue', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Download original' })).toHaveCount(2, {
    timeout: 20_000,
  });
  expect(page.url()).toBe(threadURL);
  await page.screenshot({ path: 'e2e/media/.test-results/studio.png', fullPage: true });
  await page.getByRole('button', { name: 'Use in chat', exact: true }).first().click();
  await page.getByRole('button', { name: 'New chat', exact: true }).click();
  await expect(page).toHaveURL(/\/c\/new$/);
  await expect(page.getByTestId('text-input')).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'Oops!' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Create media', exact: true }).click();
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: 'Media Studio' }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Edit attached images', exact: true }),
  ).toBeVisible();
});
