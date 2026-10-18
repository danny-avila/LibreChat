import { randomBytes, randomUUID } from 'crypto';
import { expect, test } from '@playwright/test';
import cleanupUser from '../../../setup/cleanupUser';

/**
 * The admin panel is built into the app and runs on the app's own session, so the external
 * panel's sign-in endpoints are gone, and the panel's session check refuses anyone who cannot
 * open it without echoing who they are.
 */

test.describe('built-in admin panel access', () => {
  test('the retired external panel sign-in endpoints no longer exist @scenario:retired-admin-auth-routes-gone', async ({
    playwright,
    baseURL,
  }) => {
    const request = await playwright.request.newContext({ baseURL });
    try {
      const exchange = await request.post('/api/admin/oauth/exchange', {
        data: { code: randomBytes(32).toString('hex') },
      });
      expect(exchange.status()).toBe(404);
      const body = await exchange.text();
      expect(body).not.toContain('token');

      const verify = await request.get('/api/admin/verify');
      expect(verify.status()).toBe(404);
    } finally {
      await request.dispose();
    }
  });

  test('a user who cannot open the panel is refused without echoing their email @scenario:admin-session-non-admin-denied', async ({
    playwright,
    baseURL,
  }) => {
    const request = await playwright.request.newContext({ baseURL });
    const user = {
      email: `admin-access-${randomUUID().slice(0, 8)}@example.com`,
      name: 'Admin Access',
      password: 'securepassword789',
    };
    try {
      const register = await request.post('/api/auth/register', {
        data: { ...user, confirm_password: user.password },
      });
      expect(register.ok()).toBeTruthy();

      const login = await request.post('/api/auth/login', {
        data: { email: user.email, password: user.password },
      });
      expect(login.ok()).toBeTruthy();
      const { token } = (await login.json()) as { token: string };
      expect(token).toBeTruthy();

      const response = await request.get('/api/admin/session', {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(response.status()).toBe(403);
      expect(await response.text()).not.toContain(user.email);
    } finally {
      await request.dispose();
      await cleanupUser(user);
    }
  });
});
