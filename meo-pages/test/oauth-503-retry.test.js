import test from 'node:test';
import assert from 'node:assert/strict';
import { exchangeCode, refreshTokens, OAuthTokenExchangeError } from '../functions/_lib/account.js';

const env = { MEO_OAUTH_CLIENT_ID: 'test-public-client' };
async function withFetch(handler, callback) {
  const before = globalThis.fetch;
  globalThis.fetch = handler;
  try { await callback(); }
  finally { globalThis.fetch = before; }
}

test('OAuth authorization exchange retries one transient 503 and succeeds', async () => {
  const calls = [];
  await withFetch(async (_url, init) => {
    calls.push({ grant: new URLSearchParams(init.body).get('grant_type'), cache: init.headers['Cache-Control'] });
    return calls.length === 1
      ? new Response('', {status: 503})
      : Response.json({ access_token: 'test-access', refresh_token: 'test-refresh' });
  }, async () => {
    const data = await exchangeCode(env, 'test-code', 'test-verifier', 'https://chat.meoarch.org/oauth/openid/callback');
    assert.equal(data.access_token, 'test-access');
    assert.deepEqual(calls, [
      { grant: 'authorization_code', cache: 'no-store' },
      { grant: 'authorization_code', cache: 'no-store' },
    ]);
  });
});

test('refresh retries one CPU-limit 503 and preserves the grant type', async () => {
  let count = 0;
  await withFetch(async (_url, init) => {
    count += 1;
    assert.equal(new URLSearchParams(init.body).get('grant_type'), 'refresh_token');
    return count === 1 ? new Response('', {status: 503}) : Response.json({access_token: 'access', refresh_token: 'refresh'});
  }, async () => {
    assert.equal((await refreshTokens(env, 'old-refresh'))?.access_token, 'access');
    assert.equal(count, 2);
  });
});

test('invalid grant 400 is terminal and is never retried', async () => {
  let count = 0;
  await withFetch(async () => {
    count += 1;
    return Response.json({error:'invalid_grant'}, {status:400});
  }, async () => {
    await assert.rejects(
      exchangeCode(env, 'bad', 'verifier', 'https://chat.meoarch.org/oauth/openid/callback'),
      error => error instanceof OAuthTokenExchangeError && error.reason === 'token_400_invalid_grant'
    );
    assert.equal(count, 1);
  });
});

test('repeated 503 stops after two attempts and has safe error code', async () => {
  let count = 0;
  await withFetch(async () => { count += 1; return new Response('', {status:503}); }, async () => {
    await assert.rejects(exchangeCode(env, 'code', 'verifier', 'https://chat.meoarch.org/oauth/openid/callback'),
      error => error instanceof OAuthTokenExchangeError && error.reason === 'token_http_503');
    assert.equal(count, 2);
  });
});

test('network error is not retried', async () => {
  let count = 0;
  await withFetch(async () => { count += 1; throw Error('socket closed'); }, async () => {
    await assert.rejects(exchangeCode(env, 'code', 'verifier', 'https://chat.meoarch.org/oauth/openid/callback'),
      error => error instanceof OAuthTokenExchangeError && error.reason === 'token_network_error');
    assert.equal(count, 1);
  });
});
