import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OAuthTokenExchangeError,
  accountUser,
  exchangeCode,
  refreshTokens,
} from '../functions/_lib/account.js';

const env = {
  MEO_ACCOUNT_URL: 'https://account.meoarch.org',
  MEO_API_URL: 'https://api.meoarch.org',
  MEO_OAUTH_CLIENT_ID: 'public-client-id',
};

test('OAuth code exchange uses Meo Account OAuth PKCE contract', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (input, init) => {
    assert.equal(input, `${env.MEO_ACCOUNT_URL}/v1/auth/oauth2/token`);
    assert.equal(init.method, 'POST');
    assert.equal(init.headers['Content-Type'], 'application/x-www-form-urlencoded');
    assert.equal(init.headers.apikey, undefined);
    assert.deepEqual(Object.fromEntries(new URLSearchParams(init.body)), {
      grant_type: 'authorization_code',
      code: 'one-time-code',
      code_verifier: 'pkce-verifier',
      redirect_uri: 'https://chat.meoarch.org/oauth/openid/callback',
      client_id: 'public-client-id',
      resource: 'https://api.meoarch.org',
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

test('OAuth exchange exposes only safe server error code and status', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () =>
    Response.json(
      { error: 'invalid_grant', error_description: 'sensitive server detail' },
      { status: 400 },
    );

  await assert.rejects(
    exchangeCode(
      env,
      'one-time-code',
      'pkce-verifier',
      'https://chat.meoarch.org/oauth/openid/callback',
    ),
    (error) => {
      assert.ok(error instanceof OAuthTokenExchangeError);
      assert.equal(error.reason, 'token_400_invalid_grant');
      assert.doesNotMatch(error.message, /sensitive server detail/);
      return true;
    },
  );
});

test('OAuth network failures get a stable diagnostic reason', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => {
    throw new Error('network internals');
  };

  await assert.rejects(
    exchangeCode(
      env,
      'one-time-code',
      'pkce-verifier',
      'https://chat.meoarch.org/oauth/openid/callback',
    ),
    (error) => {
      assert.ok(error instanceof OAuthTokenExchangeError);
      assert.equal(error.reason, 'token_network_error');
      return true;
    },
  );
});

test('OAuth UserInfo lookup uses bearer token and OIDC subject identity', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (input, init) => {
    assert.equal(input, `${env.MEO_ACCOUNT_URL}/v1/auth/oauth2/userinfo`);
    assert.equal(init.headers.Authorization, 'Bearer opaque-access');
    assert.equal(init.headers.apikey, undefined);
    return Response.json({
      sub: '11111111-1111-4111-8111-111111111111',
      email: 'user@example.com',
    });
  };

  const user = await accountUser(env, 'opaque-access');
  assert.equal(user.id, '11111111-1111-4111-8111-111111111111');
  assert.equal(user.sub, '11111111-1111-4111-8111-111111111111');
});

test('OAuth UserInfo lookup rejects payloads without an OIDC subject', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => Response.json({ email: 'user@example.com' });
  assert.equal(await accountUser(env, 'opaque-access'), null);
});

test('OAuth refresh uses the registered public client', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (input, init) => {
    assert.equal(input, `${env.MEO_ACCOUNT_URL}/v1/auth/oauth2/token`);
    assert.equal(init.headers['Content-Type'], 'application/x-www-form-urlencoded');
    assert.equal(init.headers.apikey, undefined);
    assert.deepEqual(Object.fromEntries(new URLSearchParams(init.body)), {
      grant_type: 'refresh_token',
      refresh_token: 'opaque-refresh',
      client_id: 'public-client-id',
      resource: 'https://api.meoarch.org',
    });
    return Response.json({ access_token: 'rotated-access', refresh_token: 'rotated-refresh' });
  };
  assert.equal((await refreshTokens(env, 'opaque-refresh')).access_token, 'rotated-access');
});
