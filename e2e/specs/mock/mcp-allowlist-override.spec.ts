import { expect, test } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { getPrimaryE2EUser } from '../../setup/users.mock';

/**
 * Proves the #13809 fix end to end: an admin-panel `mcpSettings.allowedDomains`
 * override is honored by MCP inspection/connection without a restart.
 *
 * `e2e-http` (a URL-based MCP fixture) boots `inspectionFailed` because its origin
 * is absent from the YAML allowlist. Adding that origin via an admin config override
 * must let the server reinitialize. Before the fix, reinspection used the frozen
 * YAML allowlist and the server stayed unreachable.
 *
 * Pure-API e2e against the real backend + DB: the JWT comes from the Authorization
 * header (`ExtractJwt.fromAuthHeaderAsBearerToken`), so we log in for a token rather
 * than relying on the browser storage state.
 */

const SERVER_NAME = 'e2e-http';
/** Must match the `e2e-http` URL origin in e2e/config/librechat.e2e.yaml. */
const FIXTURE_ORIGIN = `http://127.0.0.1:${process.env.E2E_MCP_HTTP_PORT || '8765'}`;

async function reinitialize(
  request: APIRequestContext,
  headers: Record<string, string>,
): Promise<{ status: number; success: boolean }> {
  const res = await request.post(`/api/mcp/${SERVER_NAME}/reinitialize`, { headers });
  if (!res.ok()) {
    return { status: res.status(), success: false };
  }
  const body = (await res.json()) as { success?: boolean };
  return { status: res.status(), success: body.success === true };
}

test.describe('MCP admin-panel allowlist override', () => {
  test('honors an admin mcpSettings.allowedDomains override so a blocked server reinitializes', async ({
    request,
  }) => {
    test.setTimeout(120000);

    // The seeded primary user is the first-registered user → ADMIN, so it can write
    // config overrides. Log in for a Bearer token + the user id.
    const { email, password } = getPrimaryE2EUser();
    const loginRes = await request.post('/api/auth/login', { data: { email, password } });
    expect(loginRes.ok()).toBeTruthy();
    const { token, user } = (await loginRes.json()) as {
      token: string;
      user: { id?: string; _id?: string };
    };
    const userId = user.id ?? user._id;
    expect(token).toBeTruthy();
    expect(userId).toBeTruthy();

    const headers = { Authorization: `Bearer ${token}` };

    // Baseline: the fixture's origin is not in the YAML allowlist, so reinit fails.
    const before = await reinitialize(request, headers);
    expect(before.status).toBe(200);
    expect(before.success).toBe(false);

    // Admin-panel override: allow the fixture's origin for this user.
    const put = await request.put(`/api/admin/config/user/${userId}`, {
      headers,
      data: { overrides: { mcpSettings: { allowedDomains: [FIXTURE_ORIGIN] } } },
    });
    expect(put.ok()).toBeTruthy();

    // The override is honored on reinit: the server now connects. invalidateConfigCaches
    // runs asynchronously after the PUT, so poll until the merged allowlist lands.
    await expect
      .poll(async () => (await reinitialize(request, headers)).success, {
        timeout: 30000,
        intervals: [1000, 2000, 3000],
      })
      .toBe(true);
  });
});
