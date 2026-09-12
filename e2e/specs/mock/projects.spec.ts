import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { MOCK_ENDPOINTS, mockReply, selectMockEndpoint, sendMessage } from './helpers';

/**
 * Creates a project from the all-projects page and returns its id.
 * Project creation navigates to the project workspace (`/projects/:id`).
 */
async function createProject(page: Page, name: string): Promise<string> {
  await page.goto('/projects', { timeout: 10000 });
  await page.getByRole('button', { name: 'New project' }).first().click();

  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Project name' }).fill(name);
  await dialog.getByRole('button', { name: 'Create project' }).click();

  await expect(page.getByRole('heading', { name })).toBeVisible();
  const projectId = new URL(page.url()).pathname.split('/projects/')[1];
  expect(projectId).toBeTruthy();
  return projectId;
}

const uniqueName = (prefix: string) => `${prefix} ${Date.now()}-${Math.floor(Math.random() * 1e4)}`;

test.describe('chat projects', () => {
  test('creates a project and lists it on the all-projects page', async ({ page }) => {
    test.setTimeout(60000);
    const name = uniqueName('E2E Project');

    await createProject(page, name);

    await page.goto('/projects', { timeout: 10000 });
    await expect(page.getByRole('button', { name }).first()).toBeVisible();
  });

  test('starts a project-scoped chat and persists it under the project', async ({ page }) => {
    test.setTimeout(120000);
    const name = uniqueName('E2E Project');
    const projectId = await createProject(page, name);

    // The workspace exposes a composer entry to start a chat in the project.
    await expect(page.getByRole('button', { name: `New chat in ${name}` }).first()).toBeVisible();

    // Open the project-scoped new-chat landing directly.
    await page.goto(`/c/new?projectId=${projectId}`, { timeout: 10000 });

    // The interactive project chip is present, and the composer is scoped.
    await expect(page.getByRole('button', { name: 'Remove from project' })).toBeVisible();
    const input = page.getByRole('textbox', { name: 'Message input' });
    await expect(input).toHaveAttribute('placeholder', new RegExp(name));

    // Switch to a mock endpoint so the message streams without a real API key;
    // the project scope must be retained across the model switch.
    await selectMockEndpoint(page, MOCK_ENDPOINTS[0]);
    await expect(page.getByRole('button', { name: 'Remove from project' })).toBeVisible();

    // Send the message; it streams a reply and the new chat opens at /c/:id.
    const response = await sendMessage(page, 'hello from a project');
    expect(response.ok()).toBeTruthy();
    await expect(mockReply(page)).toBeVisible({ timeout: 20000 });
    await expect(page).toHaveURL(/\/c\/(?!new)/, { timeout: 15000 });

    // Expand the project in the sidebar and confirm the chat is filed under it.
    const projectRow = page.getByRole('button', { name }).first();
    if ((await projectRow.getAttribute('aria-expanded')) !== 'true') {
      await projectRow.click();
    }
    await expect(
      page.getByTestId(`project-chats-${projectId}`).getByTestId('convo-item').first(),
    ).toBeVisible();

    const conversationUrl = page.url();
    await page.reload({ timeout: 10000 });
    await expect(page).toHaveURL(conversationUrl);

    const reloadedProjectRow = page.getByRole('button', { name }).first();
    if ((await reloadedProjectRow.getAttribute('aria-expanded')) !== 'true') {
      await reloadedProjectRow.click();
    }
    await expect(
      page.getByTestId(`project-chats-${projectId}`).getByTestId('convo-item').first(),
    ).toBeVisible();
  });

  test('removes the project scope via the chip ×', async ({ page }) => {
    test.setTimeout(60000);
    const name = uniqueName('E2E Project');
    const projectId = await createProject(page, name);

    await page.goto(`/c/new?projectId=${projectId}`, { timeout: 10000 });
    await expect(page.getByRole('button', { name: 'Remove from project' })).toBeVisible();

    await page.getByRole('button', { name: 'Remove from project' }).click();

    // Chip disappears and the URL drops the project scope.
    await expect(page.getByRole('button', { name: 'Remove from project' })).toBeHidden();
    await expect(page).toHaveURL((url) => !url.searchParams.has('projectId'));
  });

  test('drops the project scope when the scoped project is deleted', async ({ page }) => {
    test.setTimeout(90000);
    const name = uniqueName('E2E Project');
    const projectId = await createProject(page, name);

    await page.goto(`/c/new?projectId=${projectId}`, { timeout: 10000 });
    await expect(page.getByRole('button', { name: 'Remove from project' })).toBeVisible();

    // Delete the scoped project from the sidebar while it is selected on the landing.
    const row = page.getByRole('button', { name, exact: true }).first();
    await expect(row).toBeVisible();
    const item = row.locator('..');
    await item.hover();
    await item.getByRole('button', { name: 'More options' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();

    // The stale chip is gone, the URL drops the now-dead project scope, and the
    // composer reverts to an unscoped chat (placeholder no longer names the project).
    await expect(page.getByRole('button', { name: 'Remove from project' })).toBeHidden();
    await expect(page).toHaveURL((url) => !url.searchParams.has('projectId'));
    await expect(page.getByRole('textbox', { name: 'Message input' })).not.toHaveAttribute(
      'placeholder',
      new RegExp(name),
    );
  });

  test('switches the project via the chip combobox', async ({ page }) => {
    test.setTimeout(90000);
    const nameA = uniqueName('E2E Project A');
    const nameB = uniqueName('E2E Project B');
    await createProject(page, nameA);
    const projectIdA = new URL(page.url()).pathname.split('/projects/')[1];
    await createProject(page, nameB);
    const projectIdB = new URL(page.url()).pathname.split('/projects/')[1];

    await page.goto(`/c/new?projectId=${projectIdA}`, { timeout: 10000 });
    await expect(page.getByRole('button', { name: 'Remove from project' })).toBeVisible();

    // Open the combobox and pick the other project.
    await page.locator('#project-landing-select').click();
    await page.getByRole('option', { name: nameB }).click();

    await expect(page).toHaveURL(new RegExp(`projectId=${projectIdB}`));
    await expect(page.getByRole('textbox', { name: 'Message input' })).toHaveAttribute(
      'placeholder',
      new RegExp(nameB),
    );
  });
});
