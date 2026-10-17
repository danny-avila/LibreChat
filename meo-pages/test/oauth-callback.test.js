import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/oauth/openid/callback.js';
import { seal } from '../functions/_lib/session.js';

const env = {
  SESSION_SECRET: 'A'.repeat(43),
  MEO_ACCOUNT_URL: 'https://account.meoarch.org',
  MEO_API_URL: 'https://api.meoarch.org',
  MEO_OAUTH_CLIENT_ID: 'public-client-id',
};

test('callback reports a safe reason when its PKCE state cookie is missing', async (t) => {
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);
  t.after(() => {
    console.warn = originalWarn;
  });

  const request = new Request(
    'https://chat.meoarch.org/oauth/openid/callback?code=one-time-code&state=opaque-state',
  );
  const response = await onRequest({ request, env });

  assert.equal(response.status, 400);
  assert.equal(response.headers.get('X-Meo-OAuth-Failure'), 'state_cookie_missing_or_invalid');
  assert.equal(
    await response.text(),
    'Meo Account sign-in failed (state_cookie_missing_or_invalid). Return to Meo AI and try again.',
  );
  assert.deepEqual(warnings, [
    ['meo_oauth_callback_failed', { reason: 'state_cookie_missing_or_invalid' }],
  ]);
  assert.doesNotMatch(JSON.stringify(warnings), /one-time-code|opaque-state/);
});

async function exerciseSuccessfulCallback(cookieName) {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);
  globalThis.fetch = async (input, init) => {
    if (input === `${env.MEO_ACCOUNT_URL}/v1/auth/oauth2/token`) {
      assert.equal(init.method, 'POST');
      return Response.json({
        access_token: 'opaque-access-token',
        refresh_token: 'opaque-refresh-token',
        expires_in: 3600,
      });
    }
    if (input === `${env.MEO_ACCOUNT_URL}/v1/auth/oauth2/userinfo`) {
      assert.equal(init.headers.Authorization, 'Bearer opaque-access-token');
      return Response.json({ sub: '11111111-1111-4111-8111-111111111111' });
    }
    throw new Error('Unexpected callback fetch');
  };

  try {
    const flow = {
      state: 'opaque-state',
      verifier: 'pkce-verifier',
      returnTo: '/new?connection=credential-id&model=model-id',
      createdAt: Date.now(),
    };
    const sealedFlow = await seal(flow, env);
    const request = new Request(
      'https://chat.meoarch.org/oauth/openid/callback?code=one-time-code&state=opaque-state',
      { headers: { Cookie: `${cookieName}=${sealedFlow}` } },
    );

    const response = await onRequest({ request, env });

    assert.equal(response.status, 302);
    assert.equal(response.headers.get('Location'), flow.returnTo);
    const setCookie = response.headers.get('Set-Cookie') ?? '';
    assert.match(setCookie, /^__Host-meo-session=/);
    assert.doesNotMatch(setCookie, /^__Host-meo-oauth=/);
    assert.match(setCookie, /Path=\/;/);
    assert.deepEqual(response.headers.getSetCookie?.(), [response.headers.get('Set-Cookie')]);
    assert.deepEqual(warnings, []);
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
}

test('callback exchanges the code with the host-only OAuth state cookie', async () => {
  await exerciseSuccessfulCallback('__Host-meo-oauth');
});

test('callback accepts the legacy OAuth state cookie during migration', async () => {
  await exerciseSuccessfulCallback('__Secure-meo-oauth');
});
