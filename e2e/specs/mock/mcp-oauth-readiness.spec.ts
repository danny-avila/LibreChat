import { expect, test } from '@playwright/test';

const SERVER_NAME = 'e2e-memory';
const SERVER_TITLE = 'E2E Memory';
const FLOW_ID = 'e2e-user:e2e-memory';

test.describe('MCP OAuth readiness', () => {
  test('keeps the server unselected until post-OAuth tool readiness completes', async ({
    page,
  }) => {
    test.setTimeout(120000);

    let reinitializeCalls = 0;
    let flowStatusCalls = 0;
    let readinessComplete = false;
    let markPendingPolled!: () => void;
    let markReadinessStarted!: () => void;
    let releaseReadiness!: () => void;
    const readinessStarted = new Promise<void>((resolve) => {
      markReadinessStarted = resolve;
    });
    const pendingPolled = new Promise<void>((resolve) => {
      markPendingPolled = resolve;
    });
    const readinessGate = new Promise<void>((resolve) => {
      releaseReadiness = resolve;
    });

    await page.route('**/api/mcp/connection/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          oauthTimeout: 30000,
          connectionStatus: {
            [SERVER_NAME]: readinessComplete
              ? {
                  connectionState: 'connected',
                  requiresOAuth: true,
                  authorizationState: 'authorized',
                }
              : {
                  /** A retry can begin while React Query still holds the previous attempt's
                   * terminal status. The live PENDING flow must supersede this stale error. */
                  connectionState: 'error',
                  requiresOAuth: true,
                  authorizationState: 'error',
                },
          },
        }),
      });
    });

    await page.route(`**/api/mcp/${SERVER_NAME}/reinitialize`, async (route) => {
      reinitializeCalls++;
      if (reinitializeCalls === 1) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            message: 'OAuth authorization required',
            serverName: SERVER_NAME,
            oauthRequired: true,
            oauthUrl: 'https://oauth.example.test/authorize',
            flowId: FLOW_ID,
            oauthTimeout: 30000,
          }),
        });
        return;
      }

      markReadinessStarted();
      await readinessGate;
      readinessComplete = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'MCP server reinitialized successfully',
          serverName: SERVER_NAME,
          oauthRequired: false,
        }),
      });
    });

    await page.route('**/api/mcp/oauth/status/**', async (route) => {
      flowStatusCalls++;
      if (flowStatusCalls === 1) {
        markPendingPolled();
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'PENDING', completed: false, failed: false }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'COMPLETED', completed: true, failed: false }),
      });
    });

    await page.goto('/c/new', { timeout: 10000 });
    await page.getByRole('button', { name: 'MCP Servers', exact: true }).click();
    const serverItem = page.getByRole('menuitemcheckbox', { name: new RegExp(SERVER_TITLE) });
    await expect(serverItem).toHaveAttribute('aria-checked', 'false');
    await serverItem.getByRole('button', { name: `Connect ${SERVER_NAME}` }).click();

    await page.getByRole('button', { name: 'Authenticate', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Continue with OAuth' })).toBeVisible();
    await pendingPolled;

    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'MCP Servers', exact: true }).click();
    await expect(serverItem.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect(page.getByText('Failed to initialize MCP server')).toHaveCount(0);

    await readinessStarted;

    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'MCP Servers', exact: true }).click();
    await expect(serverItem).toHaveAttribute('aria-checked', 'false');
    await expect(serverItem.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect(
      page.getByText(`MCP server '${SERVER_NAME}' authenticated successfully`),
    ).toHaveCount(0);

    releaseReadiness();

    await expect(
      page.getByText(`MCP server '${SERVER_NAME}' authenticated successfully`).first(),
    ).toBeVisible();
    await expect(serverItem).toHaveAttribute('aria-checked', 'true');
    expect(reinitializeCalls).toBe(2);
  });

  test('stops a reused OAuth spinner at the attempt remaining lifetime', async ({ page }) => {
    test.setTimeout(30000);

    let flowStatusCalls = 0;
    await page.route('**/api/mcp/connection/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          oauthTimeout: 30000,
          connectionStatus: {
            [SERVER_NAME]: {
              connectionState: 'error',
              requiresOAuth: true,
              authorizationState: 'error',
            },
          },
        }),
      });
    });
    await page.route(`**/api/mcp/${SERVER_NAME}/reinitialize`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'OAuth authorization required',
          serverName: SERVER_NAME,
          oauthRequired: true,
          oauthUrl: 'https://oauth.example.test/authorize',
          flowId: FLOW_ID,
          oauthTimeout: 5500,
        }),
      });
    });
    await page.route('**/api/mcp/oauth/status/**', async (route) => {
      flowStatusCalls++;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'PENDING', completed: false, failed: false }),
      });
    });

    await page.goto('/c/new', { timeout: 10000 });
    await page.getByRole('button', { name: 'MCP Servers', exact: true }).click();
    const serverItem = page.getByRole('menuitemcheckbox', { name: new RegExp(SERVER_TITLE) });
    await serverItem.getByRole('button', { name: `Connect ${SERVER_NAME}` }).click();
    await page.getByRole('button', { name: 'Authenticate', exact: true }).click();

    await expect(page.getByText(`OAuth login timed out for ${SERVER_NAME}`).first()).toBeVisible({
      timeout: 15000,
    });
    expect(flowStatusCalls).toBe(1);

    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'MCP Servers', exact: true }).click();
    await expect(serverItem.getByRole('button', { name: `Connect ${SERVER_NAME}` })).toBeVisible();
  });
});
