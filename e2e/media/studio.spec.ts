import { expect, test } from '@playwright/test';

test('sidebar studio queues, restores, refines and hands an original to chat', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/c/new');
  await page.getByRole('button', { name: 'Media Studio', exact: true }).first().click();
  await expect(page).toHaveURL(/\/studio$/);
  await expect(page.getByRole('heading', { name: 'Media Studio', exact: true })).toBeVisible();
  const prompt = page.getByRole('textbox', { name: 'Describe what you want to create or change' });
  await prompt.fill('A local observatory fixture');
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(page).toHaveURL(/\/studio\/threads\//);
  await expect(page.getByRole('link', { name: 'Download original' })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole('button', { name: 'Back to library', exact: true }).click();
  const tile = page.getByRole('button', { name: 'Open A local observatory fixture', exact: true });
  await expect(tile).toBeVisible();
  await expect
    .poll(() => tile.locator('img').evaluate((node: HTMLImageElement) => node.naturalWidth), {
      timeout: 20_000,
    })
    .toBe(320);
  await expect(tile).toContainText('Completed');
  await tile.click();
  await expect(page).toHaveURL(/\/studio\/threads\//);
  await expect(page.getByRole('link', { name: 'Download original' })).toBeVisible({
    timeout: 20_000,
  });
  const image = page.locator('figure img').first();
  await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBe(320);
  // A decoded image can still be clipped by the preview's constrained height.
  await expect
    .poll(() =>
      image.evaluate((node: HTMLImageElement) => {
        const imageBounds = node.getBoundingClientRect();
        const frame = node.closest('figure')!.firstElementChild!.getBoundingClientRect();
        return imageBounds.top >= frame.top && imageBounds.bottom <= frame.bottom + 1;
      }),
    )
    .toBe(true);
  const threadURL = page.url();
  const imagePath = new URL((await image.getAttribute('src'))!, page.url()).pathname;
  const previewRoute = `**${imagePath}`;
  const beforePreviewRetry = await (await page.request.get('http://127.0.0.1:8768/counts')).json();
  await page.route(previewRoute, (route) => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.reload();
  await expect(page.getByRole('button', { name: 'Reload preview', exact: true })).toBeVisible();
  await page.unroute(previewRoute);
  await page.getByRole('button', { name: 'Reload preview', exact: true }).click();
  await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBe(320);
  expect(await (await page.request.get('http://127.0.0.1:8768/counts')).json()).toEqual(
    beforePreviewRetry,
  );
  await expect(page.getByRole('link', { name: 'Download original' })).toBeVisible();
  const preview = page.getByRole('button', { name: 'Open full preview' }).first();
  await preview.click();
  await expect(page.getByRole('dialog').getByRole('img')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(preview).toBeFocused();
  const rename = page.getByRole('button', { name: 'Rename creation', exact: true });
  await rename.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(rename).toBeFocused();
  await page.getByRole('button', { name: 'Refine this result' }).click();
  await prompt.fill('Make the observatory warmer');
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Download original' })).toHaveCount(2, {
    timeout: 20_000,
  });
  expect(page.url()).toBe(threadURL);
  await page.screenshot({ path: 'e2e/media/.test-results/studio.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Back to library', exact: true }).click();
  await expect(prompt).not.toBeVisible();
  await page.getByTestId('studio-open-sidebar-button').click();
  await expect(page.getByTestId('close-sidebar-button')).toBeFocused();
  await page.getByTestId('close-sidebar-button').click();
  await page
    .getByRole('region', { name: 'Your library' })
    .getByRole('button', { name: 'Create media', exact: true })
    .click();
  await expect(prompt).toBeFocused();
  await page.getByRole('button', { name: 'Close editor', exact: true }).click();
  await expect(prompt).not.toBeVisible();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(threadURL);
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
  expect(pageErrors).toEqual([]);
});
