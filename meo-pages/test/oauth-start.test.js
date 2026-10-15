import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/oauth/openid/index.js';
import { unseal } from '../functions/_lib/session.js';

const env = { MEO_OAUTH_CLIENT_ID: 'public-client-id', SESSION_SECRET: 'A'.repeat(43) };

test('authorization keeps client identity, refresh scope and the PKCE challenge', async () => {
  const response = await onRequest({
    request: new Request('https://chat.meoarch.org/oauth/openid?return=%2Fnew'),
    env,
  });
  assert.equal(response.status, 302);
  const target = new URL(response.headers.get('Location'));
  assert.equal(
    target.origin + target.pathname,
    'https://account.meoarch.org/v1/auth/oauth2/authorize',
  );
  assert.equal(target.searchParams.get('client_id'), env.MEO_OAUTH_CLIENT_ID);
  assert.equal(
    target.searchParams.get('redirect_uri'),
    'https://chat.meoarch.org/oauth/openid/callback',
  );
  assert.ok(target.searchParams.get('scope').split(' ').includes('offline_access'));
  assert.equal(target.searchParams.get('code_challenge_method'), 'S256');
  const cookie = response.headers.get('Set-Cookie').split(';')[0].split('=')[1];
  const flow = await unseal(cookie, env);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(flow.verifier));
  assert.equal(
    target.searchParams.get('code_challenge'),
    Buffer.from(digest).toString('base64url'),
  );
  assert.equal(target.searchParams.get('state'), flow.state);
});

test('missing client configuration fails locally without an OAuth redirect', async () => {
  for (const clientId of [undefined, '', '   ']) {
    const response = await onRequest({
      request: new Request('https://chat.meoarch.org/oauth/openid'),
      env: { ...env, MEO_OAUTH_CLIENT_ID: clientId },
    });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('Location'), null);
    assert.equal(response.headers.get('Set-Cookie'), null);
    assert.equal((await response.json()).error, 'oauth_client_not_configured');
  }
});
