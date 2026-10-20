import { randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { TChatProject, TChatProjectFile, TFile } from 'librechat-data-provider';
import type { AgentDetail } from './agents.helpers';
import { openAgentBuilder } from './agents.helpers';
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

const accessTokens = new WeakMap<Page, string>();

function getProjectAccessToken(page: Page): string {
  const token = accessTokens.get(page);
  if (!token) throw new Error('The project test has no authenticated access token');
  return token;
}

test.beforeEach(async ({ page }) => {
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
  accessTokens.set(page, token);
  await page.waitForURL(/\/c\/new$/);
});

for (const mode of ['handoff', 'shared subagent'] as const) {
  test(`a ${mode} preserves both a project file and a same-named private agent file`, async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const adminToken = await loginAdmin(request);
    const user = await withMongo((db) =>
      db.collection('users').findOne({ email: getE2EUser().email }),
    );
    if (!user) throw new Error('The authenticated project user is unavailable');
    const overridePath = `/api/admin/config/user/${encodeURIComponent(user._id.toString())}`;
    const adminHeaders = { Authorization: `Bearer ${adminToken}` };
    const label = uniqueName('project-handoff');
    const conversationIds: string[] = [];
    const agentIds: string[] = [];
    const fileIds: string[] = [];
    let projectId: string | undefined;
    try {
      const override = await request.put(overridePath, {
        headers: adminHeaders,
        data: { overrides: { projects: { codeExecution: true } } },
      });
      expect(override.ok(), await override.text()).toBe(true);
      await page.goto('/projects');
      const token = getProjectAccessToken(page);
      const project = await requestJson<TChatProject>(page, {
        path: '/api/projects',
        token,
        method: 'POST',
        body: { name: 'Project handoff paths' },
      });
      projectId = project._id;
      await resetProvisioning(page);
      await startProjectChat(page, projectId);
      await sendMessageAndWaitForCompletion(page, `E2E_PROJECT_COLLISION:${label}:first`);
      conversationIds.push(new URL(page.url()).pathname.split('/c/')[1]);
      await expect(
        page.getByText('results.csv was added to the project.', { exact: true }),
      ).toBeVisible();
      const projectFiles = await fetchJson<TChatProjectFile[]>(
        page,
        `/api/projects/${projectId}/files`,
        token,
      );
      expect(projectFiles).toHaveLength(1);
      fileIds.push(projectFiles[0].file_id);

      const createAgent = (name: string, fields?: Pick<AgentDetail, 'edges' | 'subagents'>) =>
        requestJson<AgentDetail>(page, {
          path: '/api/agents',
          token,
          method: 'POST',
          body: {
            name,
            provider: MOCK_ENDPOINTS[1].label,
            model: MOCK_ENDPOINTS[1].model,
            tools: ['execute_code'],
            ...fields,
          },
        });
      const child = await createAgent(`${label} specialist`);
      agentIds.push(child.id);
      const upload = await page.request.post('/api/files', {
        headers: { Authorization: `Bearer ${token}` },
        multipart: {
          endpoint: 'agents',
          endpointType: 'agents',
          agent_id: child.id,
          tool_resource: 'execute_code',
          file_id: randomUUID(),
          file: {
            name: 'results.csv',
            mimeType: 'text/csv',
            buffer: Buffer.from('source,value\nprivate,7\n'),
          },
        },
      });
      expect(upload.ok(), await upload.text()).toBe(true);
      const privateFile = (await upload.json()) as TFile;
      fileIds.push(privateFile.file_id);
      const privateRef = privateFile.metadata?.codeEnvRef;
      expect(privateRef).toBeDefined();
      const parent = await createAgent(
        `${label} router`,
        mode === 'handoff'
          ? { edges: [{ from: '', to: child.id, edgeType: 'handoff' }] }
          : {
              subagents: {
                enabled: true,
                allowSelf: false,
                shareFiles: true,
                agent_ids: [child.id],
              },
            },
      );
      agentIds.push(parent.id);
      await page.goto(`/projects/${projectId}`);
      await page.getByRole('button', { name: /^New chat in / }).click();
      const form = await openAgentBuilder(page, { navigate: false });
      await form.getByRole('combobox', { name: 'Agent', exact: true }).click();
      await page.getByRole('option', { name: parent.name, exact: true }).click();
      await form.getByRole('button', { name: 'Select Agent' }).click();
      const marker = Buffer.from(
        JSON.stringify({
          label,
          routes: [
            {
              from: parent.id,
              to: child.id,
              args: {},
              targetToolCall: {
                id: `call_project_handoff_${label}`,
                name: 'bash_tool',
                args: { command: 'echo e2e' },
                outputIncludes: 'E2E code exec ok',
              },
            },
          ],
        }),
      ).toString('base64url');
      await sendMessageAndWaitForCompletion(
        page,
        mode === 'handoff'
          ? `E2E_HANDOFF:${marker}`
          : `E2E_PROJECT_CODE_SUBAGENT:${child.id}:${label}`,
      );
      conversationIds.push(new URL(page.url()).pathname.split('/c/')[1]);
      await expect(
        page
          .getByTestId('screenshot-target')
          .getByText(
            mode === 'handoff'
              ? `E2E handoff tool complete ${label}: agent=${child.id}`
              : `E2E project subagent complete ${label}`,
            { exact: true },
          ),
      ).toBeVisible();
      const debug = await page.request.get(`${CODE_API_BASE}/__debug/uploads`);
      expect(debug.ok()).toBe(true);
      const body = (await debug.json()) as {
        execs: Array<{ files: Array<{ id: string; name: string }> }>;
      };
      const files = body.execs.at(-1)!.files;
      expect(files).toHaveLength(2);
      expect(files).toContainEqual(
        expect.objectContaining({ id: privateRef!.file_id, name: 'results.csv' }),
      );
      expect(files.filter((file) => /^results-.+\.csv$/.test(file.name))).toHaveLength(1);
      const canonical = await withMongo((db) =>
        db.collection('files').findOne({ file_id: projectFiles[0].file_id }),
      );
      expect(canonical?.metadata.codeEnvRef.file_id).toBe(`e2e-project-collision-first-${label}`);
      expect(canonical?.metadata.codeEnvRef.sandboxFilename ?? canonical?.filename).toBe(
        'results.csv',
      );
    } finally {
      await request.delete(overridePath, { headers: adminHeaders });
      for (const id of agentIds.reverse()) {
        await page.request.delete(`/api/agents/${encodeURIComponent(id)}`, {
          headers: { Authorization: `Bearer ${getProjectAccessToken(page)}` },
        });
      }
      await withMongo(async (db) => {
        if (projectId)
          await db.collection('chatprojects').deleteOne({ _id: new ObjectId(projectId) });
        await db.collection('files').deleteMany({ file_id: { $in: fileIds } });
        await db.collection('messages').deleteMany({ conversationId: { $in: conversationIds } });
        await db
          .collection('conversations')
          .deleteMany({ conversationId: { $in: conversationIds } });
      });
    }
  });
}

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
  request,
}, testInfo) => {
  test.setTimeout(180_000);
  const adminToken = await loginAdmin(request);
  const user = await withMongo((db) =>
    db.collection('users').findOne({ email: getE2EUser().email }),
  );
  if (!user) throw new Error('The authenticated project user is unavailable');
  const overridePath = `/api/admin/config/user/${encodeURIComponent(user._id.toString())}`;
  const adminHeaders = { Authorization: `Bearer ${adminToken}` };
  let projectId: string | undefined;
  const label = uniqueName('project-code');
  const inputName = `${label}.csv`;
  const outputName = `e2e-run-files-${label}.csv`;
  const conversationIds: string[] = [];
  const fileIds: string[] = [];
  try {
    const override = await request.put(overridePath, {
      headers: adminHeaders,
      data: { overrides: { projects: { codeExecution: true } } },
    });
    expect(override.ok(), await override.text()).toBe(true);
    await page.route(
      (url) => url.pathname === '/api/config',
      async (route) => {
        const response = await route.fetch();
        await route.fulfill({ response, json: { ...(await response.json()), ragEnabled: false } });
      },
    );
    await page.goto('/projects');
    const token = getProjectAccessToken(page);
    const project = await requestJson<TChatProject>(page, {
      path: '/api/projects',
      token,
      method: 'POST',
      body: { name: 'Project code analysis' },
    });
    projectId = project._id;
    await page.goto(`/projects/${projectId}`);
    await expect(page.getByRole('region', { name: 'Files', exact: true })).toBeVisible();
    await resetProvisioning(page);
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
    await page
      .getByRole('button', { name: `Remove ${inputName} from project`, exact: true })
      .click();
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
  } finally {
    await request.delete(overridePath, { headers: adminHeaders });
    await withMongo(async (db) => {
      if (projectId)
        await db.collection('chatprojects').deleteOne({ _id: new ObjectId(projectId) });
      await db.collection('files').deleteMany({ file_id: { $in: fileIds } });
      await db.collection('messages').deleteMany({ conversationId: { $in: conversationIds } });
      await db.collection('conversations').deleteMany({ conversationId: { $in: conversationIds } });
    });
  }
});

for (const outputName of ['results.csv', 'my results.csv']) {
  test(`same-named outputs ${outputName} keep their originating paths and canonical references`, async ({
    page,
    request,
  }) => {
    const sanitized = outputName.includes(' ');
    const storedName = sanitized ? 'my_results-081045.csv' : outputName;
    test.setTimeout(180_000);
    const adminToken = await loginAdmin(request);
    const user = await withMongo((db) =>
      db.collection('users').findOne({ email: getE2EUser().email }),
    );
    if (!user) throw new Error('The authenticated project user is unavailable');
    const overridePath = `/api/admin/config/user/${encodeURIComponent(user._id.toString())}`;
    const adminHeaders = { Authorization: `Bearer ${adminToken}` };
    const label = uniqueName('project-collision');
    const conversationIds: string[] = [];
    let projectId: string | undefined;
    try {
      const override = await request.put(overridePath, {
        headers: adminHeaders,
        data: { overrides: { projects: { codeExecution: true } } },
      });
      expect(override.ok(), await override.text()).toBe(true);
      await page.goto('/projects');
      const token = getProjectAccessToken(page);
      const project = await requestJson<TChatProject>(page, {
        path: '/api/projects',
        token,
        method: 'POST',
        body: { name: 'Project output paths' },
      });
      projectId = project._id;
      await resetProvisioning(page);
      for (const origin of ['first', 'second']) {
        await startProjectChat(page, projectId);
        await sendMessageAndWaitForCompletion(
          page,
          `E2E_PROJECT_COLLISION:${label}:${origin}${sanitized ? ':sanitized' : ''}`,
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
          files.filter(
            (file) =>
              file.name !== outputName &&
              (sanitized ? /^my_results-.+\.csv$/ : /^results-.+\.csv$/).test(file.name),
          ),
        ).toHaveLength(1);
        const canonical = await withMongo((db) =>
          db
            .collection('files')
            .find({ file_id: { $in: projectFiles.map((file) => file.file_id) } })
            .toArray(),
        );
        expect(canonical).toHaveLength(2);
        for (const [recordIndex, origin] of ['first', 'second'].entries()) {
          const file = canonical.find(
            (file) => file.conversationId === conversationIds[recordIndex],
          );
          expect(file?.metadata.codeEnvRef.file_id).toBe(
            `e2e-project-collision-${origin}-${label}`,
          );
          expect(file?.metadata.codeEnvRef.sandboxFilename).toBeUndefined();
          expect(file?.filename).toBe(storedName);
        }
      }
    } finally {
      const restore = await request.delete(overridePath, { headers: adminHeaders });
      expect(restore.ok(), await restore.text()).toBe(true);
      await withMongo(async (db) => {
        if (projectId)
          await db
            .collection('chatprojects')
            .deleteOne({ _id: new ObjectId(projectId), user: user._id.toString() });
        await db
          .collection('files')
          .deleteMany({ conversationId: { $in: conversationIds }, user: user._id });
        await db
          .collection('messages')
          .deleteMany({ conversationId: { $in: conversationIds }, user: user._id.toString() });
        await db
          .collection('conversations')
          .deleteMany({ conversationId: { $in: conversationIds }, user: user._id.toString() });
      });
    }
  });
}
