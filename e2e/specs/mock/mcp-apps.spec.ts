import { expect, test } from '@playwright/test';
import type { FrameLocator, Page, Response } from '@playwright/test';
import {
  MOCK_ENDPOINTS,
  NEW_CHAT_PATH,
  getAccessToken,
  messagesView,
  requestJson,
  selectMockEndpoint,
  sendMessage,
} from './helpers';

const MCP_SERVER_TITLE = 'E2E MCP App';
const LEGACY_FRAME_TITLE = 'MCP HTML Resource (Embedded Content)';
const MCP_APP_ORIGIN = `http://127.0.0.1:${process.env.E2E_MCP_APP_PORT || '8768'}`;
const MCP_APP_LINK_ORIGIN = `http://localhost:${process.env.E2E_MCP_APP_PORT || '8768'}`;
const APP_ROUTE_PATHS = new Set([
  '/api/mcp/app-tool-call',
  '/api/mcp/resources/read',
  '/api/mcp/resources/list',
  '/api/mcp/resources/templates/list',
]);

type DebugEvent = { method: string; params: Record<string, unknown> };
type SharePayload = {
  shareId: string;
  messages?: Array<{ attachments?: Array<Record<string, unknown>> }>;
};

const randomLabel = () => `app-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;

function isRoute(response: Response, pathname: string) {
  return response.request().method() === 'POST' && new URL(response.url()).pathname === pathname;
}

async function selectMcpAppServer(page: Page) {
  await page.getByRole('button', { name: 'MCP Servers', exact: true }).click();
  const server = page.getByRole('menuitemcheckbox', { name: new RegExp(MCP_SERVER_TITLE) });
  await expect(server).toBeVisible();
  await server.click();
  await expect(server).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
}

function appFrame(page: Page, toolName = 'show_app'): FrameLocator {
  return page.frameLocator(`iframe[title="MCP App: ${toolName}"]`).frameLocator('iframe');
}

async function expectConnectedApp(page: Page, label: string, toolName = 'show_app') {
  const app = appFrame(page, toolName);
  await expect(app.getByTestId('status')).toHaveText('connected', { timeout: 30_000 });
  await expect(app.getByTestId('document-source')).toHaveText('resources-read-document');
  await expect(app.getByTestId('input')).toContainText(`"label":"${label}"`);
  await expect(app.getByTestId('result')).toContainText(`"label":"${label}"`);
  await expect(app.getByTestId('result-content')).toContainText('tool-result-embedded-document');
  await expect(app.getByTestId('events')).toHaveText('input,result');

  const capabilities = app.getByTestId('capabilities');
  await expect(capabilities).toContainText('serverTools');
  await expect(capabilities).toContainText('serverResources');
  await expect(capabilities).toContainText('message');
  await expect(app.getByTestId('call-tool')).toBeEnabled();
  return app;
}

async function clickAndExpectRoute(
  page: Page,
  app: FrameLocator,
  buttonTestId: string,
  pathname: string,
) {
  const [response] = await Promise.all([
    page.waitForResponse((candidate) => isRoute(candidate, pathname), { timeout: 30_000 }),
    app.getByTestId(buttonTestId).click(),
  ]);
  expect(response.ok(), `${pathname} should complete through LibreChat`).toBeTruthy();
  return response;
}

async function resetEvents(page: Page) {
  const response = await page.request.post(`${MCP_APP_ORIGIN}/__debug/reset`);
  expect(response.status()).toBe(204);
}

async function readEvents(page: Page): Promise<DebugEvent[]> {
  const response = await page.request.get(`${MCP_APP_ORIGIN}/__debug/events`);
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { events: DebugEvent[] };
  return body.events;
}

async function createShare(page: Page, conversationId: string): Promise<SharePayload> {
  await page.getByRole('button', { name: 'Export/Share' }).click();
  await page.getByTestId('share-conversation-menu-item').click();
  const dialog = page.getByRole('dialog', { name: 'Share link to chat' });
  await expect(dialog).toBeVisible();

  const [response] = await Promise.all([
    page.waitForResponse(
      (candidate) =>
        candidate.request().method() === 'POST' &&
        new URL(candidate.url()).pathname === `/api/share/${conversationId}`,
      { timeout: 30_000 },
    ),
    dialog.getByRole('button', { name: 'Create a shared link' }).click(),
  ]);
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<SharePayload>;
}

test.describe('MCP Apps full integration', () => {
  test('runs an official SDK View, reloads its snapshot, and omits UI from a public share', async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    const label = randomLabel();
    const appRequests: string[] = [];
    page.on('request', (request) => {
      const pathname = new URL(request.url()).pathname;
      if (request.method() === 'POST' && APP_ROUTE_PATHS.has(pathname)) {
        appRequests.push(pathname);
      }
    });

    await resetEvents(page);
    await page.goto(NEW_CHAT_PATH, { timeout: 15_000 });
    await selectMockEndpoint(page, MOCK_ENDPOINTS[0]);
    await selectMcpAppServer(page);

    const sandboxResponse = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/api/mcp/sandbox',
      { timeout: 60_000 },
    );
    const generation = await sendMessage(page, `E2E_MCP_APP:${label}`);
    expect(generation.ok()).toBeTruthy();
    await expect(messagesView(page).getByText(`E2E MCP App complete: ${label}`)).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.locator('iframe[data-sandbox-url]')).toHaveCount(1);
    expect((await sandboxResponse).headers()['content-security-policy']).toContain(
      'frame-src blob:',
    );

    const outerFrame = page.locator('iframe[title="MCP App: show_app"]');
    const sandboxUrl = await outerFrame.getAttribute('data-sandbox-url');
    expect(sandboxUrl).toBeTruthy();
    expect(new URL(sandboxUrl!).origin).not.toBe(new URL(page.url()).origin);
    expect(new URL(sandboxUrl!).origin).toBe('http://localhost:3080');
    await expect(outerFrame).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin');

    const innerFrame = page.frameLocator('iframe[title="MCP App: show_app"]').locator('iframe');
    await expect(innerFrame).toHaveAttribute('sandbox', 'allow-scripts allow-forms');

    const viewCsp = await appFrame(page)
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute('content');
    expect(viewCsp).toContain("default-src 'none'");
    expect(viewCsp).toContain("script-src 'self' 'unsafe-inline'");
    expect(viewCsp).toContain("style-src 'self' 'unsafe-inline'");
    expect(viewCsp).toContain("connect-src 'none'");
    expect(viewCsp).toContain("frame-src 'none'");
    expect(viewCsp).toContain("object-src 'none'");
    expect(viewCsp).not.toContain(MCP_APP_ORIGIN);

    const app = await expectConnectedApp(page, label);
    await clickAndExpectRoute(page, app, 'call-tool', '/api/mcp/app-tool-call');
    await expect(app.getByTestId('operation')).toContainText('"followUp":"from-view"');
    await page.screenshot({ path: testInfo.outputPath('settled-app.png'), fullPage: true });

    await clickAndExpectRoute(page, app, 'read-resource', '/api/mcp/resources/read');
    await expect(app.getByTestId('operation')).toHaveText('fixture-detail:current');

    await clickAndExpectRoute(page, app, 'list-resources', '/api/mcp/resources/list');
    await expect(app.getByTestId('operation')).toContainText('ui://e2e/app.html');
    await expect(app.getByTestId('operation')).toContainText('ui://e2e/details/current');
    await expect(app.getByTestId('operation')).toContainText('ui://e2e/link-app.html');

    const token = await getAccessToken(page);
    const templates = await requestJson<{ resourceTemplates: Array<{ uriTemplate: string }> }>(
      page,
      {
        path: '/api/mcp/resources/templates/list',
        method: 'POST',
        token,
        body: { serverName: 'e2e-app' },
      },
    );
    expect(templates.resourceTemplates).toEqual(
      expect.arrayContaining([expect.objectContaining({ uriTemplate: 'ui://e2e/details/{id}' })]),
    );

    const appMessage = 'E2E_MCP_APP_MESSAGE:from-view';
    const nextGeneration = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        /^\/api\/(agents|ask)\//.test(new URL(response.url()).pathname),
      { timeout: 30_000 },
    );
    await app.getByTestId('send-message').click();
    await expect(app.getByTestId('operation')).toHaveText('message-sent');
    expect((await nextGeneration).ok()).toBeTruthy();
    await expect(messagesView(page).getByText(appMessage, { exact: true })).toBeVisible({
      timeout: 30_000,
    });

    const events = await readEvents(page);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'tools/call:show_app', params: { label } }),
        expect.objectContaining({
          method: 'tools/call:follow_up',
          params: { label: 'from-view' },
        }),
        expect.objectContaining({ method: 'resources/read:details' }),
      ]),
    );
    expect(events.filter((event) => event.method === 'resources/read:show_app')).toHaveLength(1);

    const linkGeneration = await sendMessage(page, `E2E_MCP_LINK_APP:${label}`);
    expect(linkGeneration.ok()).toBeTruthy();
    await expect(messagesView(page).getByText(`E2E MCP link App complete: ${label}`)).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.locator('iframe[data-sandbox-url]')).toHaveCount(2);
    const linkApp = await expectConnectedApp(page, label, 'show_link_app');
    const linkViewCsp = await linkApp
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute('content');
    expect(linkViewCsp).toContain(`script-src 'self' 'unsafe-inline' ${MCP_APP_LINK_ORIGIN}`);
    expect(linkViewCsp).toContain("connect-src 'none'");
    expect(linkViewCsp).toContain("frame-src 'none'");

    const popupPromise = page.waitForEvent('popup', { timeout: 30_000 });
    await linkApp.getByTestId('open-link').click();
    const openedPage = await popupPromise;
    await openedPage.waitForLoadState('domcontentloaded');
    expect(new URL(openedPage.url()).origin).toBe(MCP_APP_LINK_ORIGIN);
    expect(new URL(openedPage.url()).pathname).toBe('/opened');
    await expect(openedPage.getByText('policy-permitted-open')).toBeVisible();
    await expect(linkApp.getByTestId('operation')).toHaveText('{}');
    await openedPage.close();
    expect(
      (await readEvents(page)).filter((event) => event.method === 'resources/read:show_link_app'),
    ).toHaveLength(1);

    const legacyGeneration = await sendMessage(page, `E2E_MCP_LEGACY:${label}`);
    expect(legacyGeneration.ok()).toBeTruthy();
    const legacyFrameElement = page.locator(`iframe[title="${LEGACY_FRAME_TITLE}"]`);
    await expect(legacyFrameElement).toHaveCount(1);
    const legacyFrame = page.frameLocator(`iframe[title="${LEGACY_FRAME_TITLE}"]`);
    await expect(legacyFrame.getByTestId('legacy-status')).toHaveText('legacy-ready');
    await expect(legacyFrameElement).toHaveCSS('height', '120px');

    const legacyActionGeneration = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        /^\/api\/(agents|ask)\//.test(new URL(response.url()).pathname),
      { timeout: 30_000 },
    );
    await legacyFrame.getByTestId('legacy-action').click();
    expect((await legacyActionGeneration).ok()).toBeTruthy();
    await expect(legacyFrame.getByTestId('legacy-expanded')).toBeVisible();
    await expect(legacyFrameElement).toHaveCSS('height', '360px');
    await expect(messagesView(page).getByText('E2E legacy action complete')).toBeVisible({
      timeout: 30_000,
    });
    expect(await readEvents(page)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'tools/call:show_legacy', params: { label } }),
        expect.objectContaining({
          method: 'tools/call:legacy_action',
          params: { label: 'legacy-view' },
        }),
      ]),
    );

    const conversationPath = new URL(page.url()).pathname;
    const conversationId = conversationPath.split('/').pop();
    expect(conversationId).toMatch(/^[0-9a-fA-F-]{36}$/);

    await resetEvents(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expectConnectedApp(page, label);
    await expectConnectedApp(page, label, 'show_link_app');
    await expect(page.locator(`iframe[title="${LEGACY_FRAME_TITLE}"]`)).toHaveCount(1);
    expect(
      (await readEvents(page)).filter((event) => event.method.startsWith('resources/read:show_')),
    ).toEqual([]);

    const share = await createShare(page, conversationId!);
    expect(share.shareId).toBeTruthy();
    const appRequestCountBeforeShare = appRequests.length;

    const shareResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        new URL(response.url()).pathname === `/api/share/${share.shareId}`,
      { timeout: 30_000 },
    );
    await page.goto(`/share/${share.shareId}`, { waitUntil: 'domcontentloaded' });
    const publicPayload = (await (await shareResponse).json()) as SharePayload;
    const sharedMessages = JSON.stringify(publicPayload.messages);
    expect(sharedMessages).toContain(`E2E MCP App result: ${label}`);
    expect(sharedMessages).toContain(`E2E MCP link App result: ${label}`);
    expect(sharedMessages).toContain(`E2E legacy MCP-UI result: ${label}`);
    expect(
      publicPayload.messages?.every(
        (message) => !message.attachments?.some((attachment) => attachment.type === 'ui_resources'),
      ),
    ).toBe(true);
    await expect(page.locator('iframe[data-sandbox-url]')).toHaveCount(0);
    await expect(page.locator(`iframe[title="${LEGACY_FRAME_TITLE}"]`)).toHaveCount(0);
    expect(appRequests).toHaveLength(appRequestCountBeforeShare);
  });
});
