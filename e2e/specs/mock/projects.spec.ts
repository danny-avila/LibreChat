import { randomUUID } from 'crypto';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { TMessage } from 'librechat-data-provider';
import {
  MOCK_ENDPOINTS,
  getAccessToken,
  mockReply,
  selectMockEndpoint,
  sendMessage,
} from './helpers';

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
  test('creates a project with full-width instructions when RAG is disabled', async ({ page }) => {
    test.setTimeout(60000);
    const name = uniqueName('E2E Project');
    await page.route(
      (url) => url.pathname === '/api/config',
      async (route) => {
        const response = await route.fetch();
        await route.fulfill({
          response,
          json: { ...(await response.json()), ragEnabled: false },
        });
      },
    );

    await createProject(page, name);
    await expect(page.getByRole('region', { name: 'Files', exact: true })).toHaveCount(0);
    const instructions = page.getByRole('region', { name: 'Instructions', exact: true });
    const widths = await instructions.evaluate((element) => ({
      instructions: element.getBoundingClientRect().width,
      available: element.parentElement!.getBoundingClientRect().width,
    }));
    expect(widths.instructions).toBeCloseTo(widths.available, 0);

    const header = page.getByRole('main').locator('header');
    const newChat = await header.getByRole('button', { name: /^New chat in / }).boundingBox();
    const options = await header
      .getByRole('button', { name: 'Project options', exact: true })
      .boundingBox();
    expect(newChat!.x + newChat!.width).toBeLessThan(options!.x);
    expect(newChat!.y + newChat!.height / 2).toBeCloseTo(options!.y + options!.height / 2, 0);

    await page.goto('/projects', { timeout: 10000 });
    await expect(page.getByRole('button', { name }).first()).toBeVisible();
  });

  test('preserves hosted Assistant project membership and reloads guidance on later turns', async ({
    page,
    request,
  }) => {
    test.setTimeout(120000);
    const projectId = await createProject(page, uniqueName('Hosted Project'));
    const token = await getAccessToken(page);
    const headers = { Authorization: `Bearer ${token}` };
    const firstGuidance = 'Use the original project policy.';
    const revisedGuidance = 'Use the revised project policy.';
    const update = await request.patch(`/api/projects/${projectId}`, {
      headers,
      data: { instructions: firstGuidance },
    });
    expect(update.status()).toBe(200);
    const created = await request.post('/api/assistants/v2', {
      headers,
      data: {
        endpoint: 'assistants',
        model: 'gpt-4o-mini',
        name: uniqueName('Project Assistant'),
        tools: [],
      },
    });
    expect(created.status()).toBe(201);
    const { id: assistantId } = await created.json();
    const sendTurn = async (
      conversationId: string | null = null,
      parentMessageId = '00000000-0000-0000-0000-000000000000',
      threadId?: string,
    ) => {
      const messageId = randomUUID();
      const response = await request.post('/api/assistants/v2/chat', {
        headers,
        data: {
          text: 'Apply the project policy.',
          sender: 'User',
          clientTimestamp: new Date().toISOString(),
          isCreatedByUser: true,
          parentMessageId,
          conversationId,
          messageId,
          responseMessageId: `${messageId}_response`,
          endpoint: 'assistants',
          endpointType: 'assistants',
          model: 'gpt-4o-mini',
          assistant_id: assistantId,
          thread_id: threadId,
          chatProjectId: conversationId ? undefined : projectId,
          files: [],
          isTemporary: false,
          isRegenerate: false,
          error: false,
        },
      });
      expect(response.status()).toBe(200);
      const text = await response.text();
      expect(text).toContain('"final":true');
      return text;
    };

    try {
      const missingProject = await request.post('/api/assistants/v2/chat', {
        headers,
        data: {
          text: 'Apply the project policy.',
          sender: 'User',
          isCreatedByUser: true,
          conversationId: null,
          parentMessageId: '00000000-0000-0000-0000-000000000000',
          messageId: randomUUID(),
          endpoint: 'assistants',
          endpointType: 'assistants',
          model: 'gpt-4o-mini',
          assistant_id: assistantId,
          chatProjectId: randomUUID().replace(/-/g, '').slice(0, 24),
          files: [],
        },
      });
      expect(missingProject.status()).toBe(404);

      const firstTurn = await sendTurn();
      const conversationId = firstTurn.match(/"conversationId":"([^"]+)"/)?.[1];
      expect(conversationId).toBeTruthy();
      const stored = await request.get(`/api/convos/${conversationId}`, { headers });
      expect((await stored.json()).chatProjectId).toBe(projectId);
      const messageResponse = await request.get(`/api/messages/${conversationId}`, { headers });
      const messages: TMessage[] = await messageResponse.json();
      const userMessage = messages.find((message) => message.isCreatedByUser);
      const reply = messages.find((message) => !message.isCreatedByUser);
      expect(userMessage?.thread_id).toBeTruthy();
      expect(reply?.messageId).toBeTruthy();
      const revised = await request.patch(`/api/projects/${projectId}`, {
        headers,
        data: { instructions: revisedGuidance },
      });
      expect(revised.status()).toBe(200);
      await sendTurn(conversationId!, reply!.messageId, userMessage!.thread_id);

      const provider = `http://127.0.0.1:${process.env.E2E_ASSISTANTS_PORT || '8890'}`;
      const recorded = await request.get(`${provider}/__e2e/requests`);
      const history: {
        requests: Array<{
          path: string;
          body: { assistant_id?: string; additional_instructions?: string };
        }>;
      } = await recorded.json();
      const runs = history.requests.filter(
        (entry) => entry.path.endsWith('/runs') && entry.body.assistant_id === assistantId,
      );
      expect(runs).toHaveLength(2);
      expect(runs[0].body.additional_instructions).toContain(firstGuidance);
      expect(runs[1].body.additional_instructions).toContain(revisedGuidance);
      expect(runs[1].body.additional_instructions).not.toContain(firstGuidance);
    } finally {
      await request.delete(
        `/api/assistants/v2/${encodeURIComponent(assistantId)}?endpoint=assistants&model=gpt-4o-mini`,
        { headers, data: { endpoint: 'assistants' } },
      );
    }
  });

  test('hands keyboard focus from the file menu to the picker and back', async ({ page }) => {
    await page.route(
      (url) => url.pathname === '/api/config',
      async (route) => {
        const response = await route.fetch();
        await route.fulfill({
          response,
          json: { ...(await response.json()), ragEnabled: true },
        });
      },
    );
    await createProject(page, uniqueName('E2E File Picker'));
    const addFiles = page.getByRole('button', { name: 'Add files', exact: true });
    await addFiles.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: 'Upload from device' })).toBeFocused();
    await page.keyboard.press('End');
    await expect(page.getByRole('menuitem', { name: 'Choose from your files' })).toBeFocused();
    await page.keyboard.press('Enter');
    const picker = page.getByRole('dialog');
    await expect(picker.locator(':focus')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(picker).toBeHidden();
    await expect(page.getByRole('menuitem', { name: 'Choose from your files' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(addFiles).toBeFocused();
  });

  test('edits long project metadata inline without overflowing mobile layouts', async ({
    page,
  }) => {
    await createProject(page, uniqueName('Inline project'));
    await page.setViewportSize({ width: 320, height: 844 });
    await page.getByRole('button', { name: 'Project options', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Edit project', exact: true }).click();

    const nameInput = page.getByRole('textbox', { name: 'Project name', exact: true });
    await expect(nameInput).toBeFocused();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const longName = uniqueName('Inline').padEnd(100, 'x');
    const longDescription = 'd'.repeat(1000);
    await nameInput.fill(longName);
    await page.getByRole('textbox', { name: /^Description/ }).fill(longDescription);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('heading', { name: longName, exact: true })).toBeVisible();
    await page.reload();

    const title = page.getByRole('heading', { name: longName, exact: true }).getByText(longName);
    await expect(title).toBeVisible();
    const mobileTitle = await title.evaluate((element) => ({
      height: element.getBoundingClientRect().height,
      lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
    }));
    expect(mobileTitle.height).toBeLessThanOrEqual(mobileTitle.lineHeight * 2 + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      320,
    );

    await page.getByRole('button', { name: longDescription, exact: true }).click();
    await expect(page.getByRole('textbox', { name: /^Description/ })).toHaveValue(longDescription);
    await page.getByRole('textbox', { name: 'Project name', exact: true }).fill('Unsaved change');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: longName, exact: true })).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 900 });
    const desktopTitle = await title.evaluate((element) => ({
      height: element.getBoundingClientRect().height,
      lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
    }));
    expect(desktopTitle.height).toBeLessThanOrEqual(desktopTitle.lineHeight + 1);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('main').getByRole('button', { name: 'All projects', exact: true }).click();
    await expect(page.locator('article').filter({ hasText: longName })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );

    await page.getByRole('main').getByRole('button', { name: 'Open sidebar', exact: true }).click();
    await page
      .locator('li')
      .filter({ has: page.getByRole('button', { name: longName, exact: true }) })
      .getByRole('button', { name: 'More options', exact: true })
      .click();
    await page.getByRole('menuitem', { name: 'Edit project', exact: true }).click();
    await expect(nameInput).toBeFocused();
    await expect(nameInput).toHaveValue(longName);
  });

  test('persists workspace instructions and exposes a read-only project badge', async ({
    page,
  }) => {
    test.setTimeout(120000);
    const name = uniqueName('E2E Project');
    const projectId = await createProject(page, name);
    const guidance = 'project-guidance-token';

    await page.getByRole('button', { name: 'Edit instructions' }).click();
    const instructionsDialog = page.getByRole('dialog');
    await instructionsDialog
      .getByRole('textbox', { name: 'Workspace instructions' })
      .fill(`Always follow ${guidance} when answering.`);
    await instructionsDialog.getByRole('button', { name: 'Save' }).click();
    await expect(instructionsDialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'Edit instructions' })).toBeFocused();
    await page.goto(`/c/new?projectId=${projectId}`, { timeout: 10000 });
    await selectMockEndpoint(page, MOCK_ENDPOINTS[0]);
    await sendMessage(page, `E2E_ASSERT_PROJECT_CONTEXT:${guidance}`);
    const transcript = page.getByTestId('screenshot-target');
    await expect(
      transcript.getByText(`E2E project context assertion passed: ${guidance}`),
    ).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByRole('link', { name: `Open ${name} workspace` })).toBeVisible();

    const conversationUrl = page.url();
    await page.goto(`/projects/${projectId}`, { timeout: 10000 });
    await page.getByRole('button', { name: 'Edit instructions' }).click();
    const updatedDialog = page.getByRole('dialog');
    const updatedGuidance = 'project-updated-guidance-token';
    await updatedDialog
      .getByRole('textbox', { name: 'Workspace instructions' })
      .fill(`Use ${updatedGuidance} for future turns.`);
    await updatedDialog.getByRole('button', { name: 'Save' }).click();
    await expect(updatedDialog).toBeHidden();
    await page.goto(conversationUrl, { timeout: 10000 });
    await sendMessage(page, `E2E_ASSERT_PROJECT_CONTEXT:${updatedGuidance} ${guidance}`);
    await expect(
      transcript.getByText(`E2E project context assertion passed: ${updatedGuidance}`),
    ).toBeVisible({ timeout: 20000 });
    await page.goto(`/projects/${projectId}`, { timeout: 10000 });
    await page.getByRole('button', { name: 'Edit instructions' }).click();
    const clearDialog = page.getByRole('dialog');
    await clearDialog.getByRole('textbox', { name: 'Workspace instructions' }).fill('');
    await clearDialog.getByRole('button', { name: 'Save' }).click();
    await expect(clearDialog).toBeHidden();
    await page.goto(conversationUrl, { timeout: 10000 });
    await sendMessage(page, `E2E_ASSERT_PROJECT_CONTEXT:- ${updatedGuidance}`);
    await expect(transcript.getByText('E2E project context assertion passed: -')).toBeVisible({
      timeout: 20000,
    });

    await page.reload({ timeout: 10000 });
    await expect(page).toHaveURL(conversationUrl);
    await expect(page.getByRole('link', { name: `Open ${name} workspace` })).toBeVisible();
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
