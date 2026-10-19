import { expect, test } from '@playwright/test';
import { getE2EUser } from '../../../setup/user';
import { CODE_API_BASE } from '../helpers';

/** Both ids must match the route's 21-character id pattern. */
const SESSION_ID = 'e2esessionstream00001';
const FILE_ID = 'e2efilestreamfailure1';

test.describe('code output downloads', () => {
  test.afterEach(async ({ request }) => {
    await request.post(`${CODE_API_BASE}/__debug/corrupt-downloads`, { data: { corrupt: false } });
  });

  /* The fake code API answers with a body that claims gzip but is not, so decompression fails
     after the response has started. Unhandled, that stream error took the whole server down. */
  test('a download that fails mid-stream leaves the server running @scenario:failed-code-download-keeps-server-up', async ({
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

      const corrupt = await request.post(`${CODE_API_BASE}/__debug/corrupt-downloads`, {
        data: { corrupt: true },
      });
      expect(corrupt.ok()).toBeTruthy();

      const download = await client
        .get(`/api/files/code/download/${SESSION_ID}/${FILE_ID}`, {
          headers: { Authorization: `Bearer ${token}` },
          failOnStatusCode: false,
        })
        .then((response) => response.body().then(() => 'completed'))
        .catch(() => 'aborted');
      expect(['completed', 'aborted']).toContain(download);

      /* The process survived: it keeps answering, now and a moment later. */
      expect((await client.get('/health')).status()).toBe(200);
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      expect((await client.get('/health')).status()).toBe(200);
    } finally {
      await client.dispose();
    }
  });
});
