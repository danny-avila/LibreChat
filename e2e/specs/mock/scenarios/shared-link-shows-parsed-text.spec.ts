import { expect, test } from '@playwright/test';
import { mockReply, sendMessage } from '../helpers';
import type { UploadedTextFile } from './documents.helpers';
import { documentFixture, openUnifiedComposer, uploadViaUnifiedButton } from './documents.helpers';

/**
 * A parsed document has no downloadable preview of its own: its content is the text the
 * server extracted. A viewer of a shared conversation must therefore be able to read
 * that text, or the attachment is a dead chip on the public page.
 */
test('a viewer of a shared conversation can read the parsed document text @scenario:shared-link-shows-parsed-text', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(240000);
  if (typeof baseURL !== 'string') {
    throw new Error('baseURL must be configured for the shared-link scenario');
  }

  await openUnifiedComposer(page);
  const upload = documentFixture('structured.docx');
  const uploadResponse = await uploadViaUnifiedButton(page, upload);
  expect(uploadResponse.status(), await uploadResponse.text()).toBe(200);
  expect(((await uploadResponse.json()) as UploadedTextFile).source).toBe('text');

  const prompt = `Shared parsed document ${Date.now()}`;
  const sent = await sendMessage(page, prompt);
  expect(sent.ok()).toBeTruthy();
  await expect(mockReply(page)).toBeVisible({ timeout: 30000 });
  await expect(page).toHaveURL(/\/c\/(?!new)[0-9a-fA-F-]{36}$/);
  const conversationId = new URL(page.url()).pathname.split('/').pop();

  await page.getByRole('button', { name: 'Export/Share' }).click();
  await page.getByTestId('share-conversation-menu-item').click();
  const shareDialog = page.getByRole('dialog', { name: 'Share link to chat' });
  await expect(shareDialog).toBeVisible();
  await expect(
    shareDialog.getByRole('switch', { name: 'Share files in this conversation' }),
  ).toBeChecked();

  const [shareResponse] = await Promise.all([
    page.waitForResponse(
      (res) =>
        res.request().method() === 'POST' &&
        res.url().includes(`/api/share/${conversationId}`) &&
        res.status() === 200,
      { timeout: 30000 },
    ),
    page.getByRole('button', { name: 'Create a shared link' }).click(),
  ]);
  expect(shareResponse.ok()).toBeTruthy();

  const sharedLinkUrl = (await page.getByTestId('shared-link-url').inputValue()).trim();
  expect(sharedLinkUrl).toContain('/share/');

  await page.goto(new URL(sharedLinkUrl, baseURL).pathname, { timeout: 15000 });
  await expect(page.getByTestId('messages-view').getByText(prompt, { exact: true })).toBeVisible({
    timeout: 30000,
  });

  await page
    .getByTestId('messages-view')
    .getByRole('button', { name: upload.name, exact: true })
    .click();

  const region = page.getByRole('region', { name: 'Extracted text' });
  await expect(region).toBeVisible({ timeout: 30000 });
  await expect(region).toContainText('Quarterly Report');
});
