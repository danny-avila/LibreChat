import test from 'node:test';
import assert from 'node:assert/strict';
import { exchangeCode, refreshTokens } from '../functions/_lib/account.js';

const env = {
  SUPABASE_URL: 'https://bdyhkkgwhcamfyoqcthx.supabase.co',
  SUPABASE_ANON_KEY: 'public-anon-key',
  MEO_OAUTH_CLIENT_ID: 'public-client-id',
};

test('OAuth code exchange uses Supabase public-client PKCE contract', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (input, init) => {
    assert.equal(input, `${env.SUPABASE_URL}/auth/v1/oauth/token`);
    assert.equal(init.method, 'POST');
    assert.equal(init.headers['Content-Type'], 'application/x-www-form-urlencoded');
    assert.equal(init.headers.apikey, env.SUPABASE_ANON_KEY);
    assert.deepEqual(Object.fromEntries(new URLSearchParams(init.body)), {
      grant_type: 'authorization_code',
      code: 'one-time-code',
      code_verifier: 'pkce-verifier',
      redirect_uri: 'https://chat.meoarch.org/oauth/openid/callback',
      client_id: 'public-client-id',
    });
    return Response.json({ access_token: 'opaque-access', refresh_token: 'opaque-refresh' });
  };
  assert.equal(
    (
      await exchangeCode(
        env,
        'one-time-code',
        'pkce-verifier',
        'https://chat.meoarch.org/oauth/openid/callback',
      )
    ).access_token,
    'opaque-access',
  );
});

test('OAuth refresh uses the registered public client and Supabase public API key', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (input, init) => {
    assert.equal(input, `${env.SUPABASE_URL}/auth/v1/oauth/token`);
    assert.equal(init.headers['Content-Type'], 'application/x-www-form-urlencoded');
    assert.equal(init.headers.apikey, env.SUPABASE_ANON_KEY);
    assert.deepEqual(Object.fromEntries(new URLSearchParams(init.body)), {
      grant_type: 'refresh_token',
      refresh_token: 'opaque-refresh',
      client_id: 'public-client-id',
    });
    return Response.json({ access_token: 'rotated-access', refresh_token: 'rotated-refresh' });
  };
  assert.equal((await refreshTokens(env, 'opaque-refresh')).access_token, 'rotated-access');
});
