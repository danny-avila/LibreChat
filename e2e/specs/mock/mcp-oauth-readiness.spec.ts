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
    let readinessComplete = false;
    let markReadinessStarted!: () => void;
    let releaseReadiness!: () => void;
    const readinessStarted = new Promise<void>((resolve) => {
      markReadinessStarted = resolve;
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
                  connectionState: 'disconnected',
                  requiresOAuth: true,
                  authorizationState: 'needs_authorization',
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
      page.getByText(`MCP server '${SERVER_NAME}' authenticated successfully`),
    ).toBeVisible();
    await expect(serverItem).toHaveAttribute('aria-checked', 'true');
    expect(reinitializeCalls).toBe(2);
  });
});
