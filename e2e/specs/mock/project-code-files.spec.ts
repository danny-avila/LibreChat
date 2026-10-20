import { ObjectId } from 'mongodb';
import { expect, test as base } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { TChatProject, TChatProjectFile, TFile } from 'librechat-data-provider';
import { getE2EUser } from '../../setup/user';
import { login } from '../../setup/authenticate';
import { withMongo } from './db';
import { loginAdmin } from './content-filters.helpers';

import {
  CODE_API_BASE,
  MOCK_ENDPOINTS,
  fetchJson,
  uniqueName,
  requestJson,
  getRagQueries,
  getRagEmbedded,
  selectMockEndpoint,
  resetProvisioning,
  enableCodeInterpreter,
  enableFileSearch,
  sendMessageAndWaitForCompletion,
} from './helpers';

const test = base.extend<{
  project: { id: string; token: string; conversationIds: string[]; fileIds: string[] };
}>({
  project: async ({ page, request }, runTest) => {
    await page.context().clearCookies();
    await page.goto('/login');
    const loginResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/auth/login' &&
        response.request().method() === 'POST',
    );
    await login(page, getE2EUser());
    const response = await loginResponse;
    expect(response.ok()).toBe(true);
    const { token } = (await response.json()) as { token: string };
    expect(token).toBeTruthy();
    await page.waitForURL(/\/c\/new$/);
    const adminToken = await loginAdmin(request);
    const user = await withMongo((db) =>
      db.collection('users').findOne({ email: getE2EUser().email }),
    );
    if (!user) throw new Error('The authenticated project user is unavailable');
    const overridePath = `/api/admin/config/user/${encodeURIComponent(user._id.toString())}`;
    const adminHeaders = { Authorization: `Bearer ${adminToken}` };
    let id: string | undefined;
    const conversationIds: string[] = [];
    const fileIds: string[] = [];
    try {
      const override = await request.put(overridePath, {
        headers: adminHeaders,
        data: { overrides: { projects: { codeExecution: true } } },
      });
      expect(override.ok(), await override.text()).toBe(true);
      await page.goto('/projects');
      const project = await requestJson<TChatProject>(page, {
        path: '/api/projects',
        token,
        method: 'POST',
        body: { name: uniqueName('Project code analysis') },
      });
      id = project._id;
      await resetProvisioning(page);
      await runTest({ id, token, conversationIds, fileIds });
    } finally {
      const restore = await request.delete(overridePath, { headers: adminHeaders });
      expect(restore.ok(), await restore.text()).toBe(true);
      await withMongo(async (db) => {
        if (id)
          await db
            .collection('chatprojects')
            .deleteOne({ _id: new ObjectId(id), user: user._id.toString() });
        await db.collection('files').deleteMany({
          user: user._id,
          $or: [{ file_id: { $in: fileIds } }, { conversationId: { $in: conversationIds } }],
        });
        await db
          .collection('messages')
          .deleteMany({ conversationId: { $in: conversationIds }, user: user._id.toString() });
        await db
          .collection('conversations')
          .deleteMany({ conversationId: { $in: conversationIds }, user: user._id.toString() });
      });
    }
  },
});

async function startProjectChat(page: Page, projectId: string): Promise<void> {
  await page.goto(`/projects/${encodeURIComponent(projectId)}`);
  await page.getByRole('button', { name: /^New chat in / }).click();
  await selectMockEndpoint(page, MOCK_ENDPOINTS[1]);
  await enableCodeInterpreter(page);
}

async function sandboxFiles(page: Page): Promise<string[][]> {
  const response = await page.request.get(`${CODE_API_BASE}/__debug/uploads`);
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as { execs: Array<{ files?: Array<{ name?: string }> }> };
  return body.execs.map((exec) => exec.files?.map((file) => file.name ?? '') ?? []);
}

test('project CSV and generated output are shared across chats, without indexing, until removed', async ({
  page,
  project,
}, testInfo) => {
  test.setTimeout(180_000);
  const { id: projectId, token, conversationIds, fileIds } = project;
  const label = uniqueName('project-code');
  const inputName = `${label}.csv`;
  const outputName = `e2e-run-files-${label}.csv`;
  await page.route(
    (url) => url.pathname === '/api/config',
    async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, json: { ...(await response.json()), ragEnabled: false } });
    },
  );
  await page.goto(`/projects/${projectId}`);
  await expect(page.getByRole('region', { name: 'Files', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add files', exact: true }).click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('menuitem', { name: 'Upload from device', exact: true }).click(),
  ]);
  const uploaded = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/files' && response.request().method() === 'POST',
  );
  await chooser.setFiles({
    name: inputName,
    mimeType: 'text/csv',
    buffer: Buffer.from('name,count\nalice,2\n'),
  });
  const response = await uploaded;
  expect(response.ok(), await response.text()).toBe(true);
  const input = (await response.json()) as TFile;
  fileIds.push(input.file_id);
  expect(input.embedded).not.toBe(true);
  await expect(page.getByRole('listitem').filter({ hasText: inputName })).toBeVisible();
  expect(await getRagEmbedded(page)).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('project-code-files.png') });

  await startProjectChat(page, projectId);
  await sendMessageAndWaitForCompletion(page, `E2E_EXECUTE_CODE:${label}-first`);
  conversationIds.push(new URL(page.url()).pathname.split('/c/')[1]);
  expect((await sandboxFiles(page)).some((files) => files.includes(inputName))).toBe(true);
  expect(await getRagEmbedded(page)).toEqual([]);

  await sendMessageAndWaitForCompletion(page, `E2E_PROJECT_OUTPUT:${label}`);
  await expect(
    page.getByText(`${outputName} was added to the project.`, { exact: true }),
  ).toBeVisible();
  const projectFiles = await fetchJson<TChatProjectFile[]>(
    page,
    `/api/projects/${projectId}/files`,
    token,
  );
  const generated = projectFiles.find((file) => file.filename === outputName);
  expect(generated).toBeTruthy();
  fileIds.push(generated!.file_id);

  await startProjectChat(page, projectId);
  await sendMessageAndWaitForCompletion(page, `E2E_EXECUTE_CODE:${label}-second`);
  conversationIds.push(new URL(page.url()).pathname.split('/c/')[1]);
  const latest = (await sandboxFiles(page)).at(-1) ?? [];
  expect(latest).toContain(inputName);
  expect(latest).toContain(outputName);
  await enableFileSearch(page);
  await sendMessageAndWaitForCompletion(page, `E2E_FILE_SEARCH:${label}`);
  expect(await getRagEmbedded(page)).toEqual([]);
  expect(await getRagQueries(page)).toEqual([]);

  await page.goto(`/projects/${projectId}`);
  await page.getByRole('button', { name: `Remove ${inputName} from project`, exact: true }).click();
  await expect(
    page.getByRole('button', { name: `Remove ${inputName} from project`, exact: true }),
  ).toHaveCount(0);
  await startProjectChat(page, projectId);
  await sendMessageAndWaitForCompletion(page, `E2E_EXECUTE_CODE:${label}-removed`);
  conversationIds.push(new URL(page.url()).pathname.split('/c/')[1]);
  const afterRemoval = (await sandboxFiles(page)).at(-1) ?? [];
  expect(afterRemoval).not.toContain(inputName);
  expect(afterRemoval).toContain(outputName);
  expect(await getRagEmbedded(page)).toEqual([]);

  await page.goto(`/projects/${projectId}`);
  await page
    .getByRole('button', { name: `Remove ${outputName} from project`, exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: `Remove ${outputName} from project`, exact: true }),
  ).toHaveCount(0);
  await page.goto(`/c/${conversationIds[0]}`);
  await sendMessageAndWaitForCompletion(page, `E2E_PROJECT_OUTPUT:${label}`);
  expect(
    await fetchJson<TChatProjectFile[]>(page, `/api/projects/${projectId}/files`, token),
  ).toEqual([]);
});

const outputName = 'my results.csv';
test(`same-named outputs ${outputName} keep their originating paths and canonical references`, async ({
  page,
  project,
}) => {
  const storedName = 'my_results-081045.csv';
  test.setTimeout(180_000);
  const { id: projectId, token, conversationIds } = project;
  const label = uniqueName('project-collision');
  for (const origin of ['first', 'second']) {
    await startProjectChat(page, projectId);
    await sendMessageAndWaitForCompletion(
      page,
      `E2E_PROJECT_COLLISION:${label}:${origin}:sanitized`,
    );
    conversationIds.push(new URL(page.url()).pathname.split('/c/')[1]);
    await expect(
      page.getByText(`${storedName} was added to the project.`, { exact: true }),
    ).toBeVisible();
  }
  const projectFiles = await fetchJson<TChatProjectFile[]>(
    page,
    `/api/projects/${projectId}/files`,
    token,
  );
  expect(projectFiles.map((file) => file.filename)).toEqual([storedName, storedName]);
  for (const [index, origin] of ['first', 'second'].entries()) {
    await page.goto(`/c/${conversationIds[index]}`);
    await sendMessageAndWaitForCompletion(page, `E2E_EXECUTE_CODE:${label}-${origin}-resume`);
    const response = await page.request.get(`${CODE_API_BASE}/__debug/uploads`);
    const body = (await response.json()) as {
      execs: Array<{ files: Array<{ id: string; name: string }> }>;
    };
    const files = body.execs.at(-1)!.files;
    expect(files).toHaveLength(2);
    expect(files).toContainEqual(
      expect.objectContaining({
        id: `e2e-project-collision-${origin}-${label}`,
        name: outputName,
      }),
    );
    expect(
      files.filter((file) => file.name !== outputName && /^my_results-.+\.csv$/.test(file.name)),
    ).toHaveLength(1);
    const canonical = await withMongo((db) =>
      db
        .collection('files')
        .find({ file_id: { $in: projectFiles.map((file) => file.file_id) } })
        .toArray(),
    );
    expect(canonical).toHaveLength(2);
    for (const [recordIndex, origin] of ['first', 'second'].entries()) {
      const file = canonical.find((file) => file.conversationId === conversationIds[recordIndex]);
      expect(file?.metadata.codeEnvRef.file_id).toBe(`e2e-project-collision-${origin}-${label}`);
      expect(file?.metadata.codeEnvRef.sandboxFilename).toBeUndefined();
      expect(file?.filename).toBe(storedName);
    }
  }
});
