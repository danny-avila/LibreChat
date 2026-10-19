import http from 'node:http';
import { expect, test } from '@playwright/test';
import { getE2EUser } from '../../../setup/user';
import { CODE_API_BASE } from '../helpers';

/** Both ids must match the route's 21-character id pattern. */
const SESSION_ID = 'e2esessionstream00001';
const FILE_ID = 'e2efilestreamfailure1';

/** Starts a download and drops the connection as soon as the first bytes arrive. */
function downloadAndDisconnect(url: string, token: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { headers: { Authorization: `Bearer ${token}` } }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`download answered ${res.statusCode}`));
        return;
      }
      res.once('data', () => {
        req.destroy();
        resolve();
      });
    });
    req.on('error', () => undefined);
  });
}

test.describe('code output downloads', () => {
  test.afterEach(async ({ request }) => {
    await request.post(`${CODE_API_BASE}/__debug/reset`);
  });

  /* The fake code API trickles a long body. Once the browser side leaves, LibreChat must close
     its upstream download too instead of holding the connection open, paused, until a timeout. */
  test('leaving a download closes the upstream code download @scenario:abandoned-code-download-closes-upstream', async ({
    playwright,
    baseURL,
    request,
  }) => {
    const client = await playwright.request.newContext({ baseURL });
    try {
      const { email, password } = getE2EUser();
      const login = await client.post('/api/auth/login', { data: { email, password } });
      expect(login.ok()).toBeTruthy();
      const { token } = (await login.json()) as { token: string };

      await request.post(`${CODE_API_BASE}/__debug/reset`);
      const slow = await request.post(`${CODE_API_BASE}/__debug/slow-downloads`, {
        data: { slow: true },
      });
      expect(slow.ok()).toBeTruthy();

      await downloadAndDisconnect(
        new URL(`/api/files/code/download/${SESSION_ID}/${FILE_ID}`, baseURL).toString(),
        token,
      );

      await expect
        .poll(
          async () => {
            const response = await request.get(`${CODE_API_BASE}/__debug/downloads`);
            return ((await response.json()) as { closedSlowDownloads: number }).closedSlowDownloads;
          },
          { timeout: 5_000, intervals: [250] },
        )
        .toBe(1);
      expect((await client.get('/health')).status()).toBe(200);
    } finally {
      await client.dispose();
    }
  });
});
