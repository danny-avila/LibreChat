import test from 'node:test';
import assert from 'node:assert/strict';
import { seal, sessionCookieHeader } from '../functions/_lib/session.js';
import { loadSession } from '../functions/_lib/account.js';
import { onRequestGet as getSession } from '../functions/api/meo/session.js';
import { onRequest as proxy } from '../functions/api/meo/[[path]].js';

const env = {
  SESSION_SECRET: Buffer.alloc(32, 17).toString('base64url'),
  MEO_OAUTH_CLIENT_ID: 'test-public-client',
};
async function makeRequest(path = '/api/meo/connections') {
  const cookie = await seal({
    accessToken: 'expired-access',
    refreshToken: 'still-valid-refresh',
    expiresAt: Math.floor(Date.now() / 1000) - 60,
    userId: '00000000-0000-4000-8000-000000000001',
  }, env);
  return new Request('https://chat.meoarch.org' + path, {
    method: 'GET',
    headers: { Cookie: sessionCookieHeader(cookie).split(';')[0] },
  });
}
async function withMockFetch(handler, callback) {
  const real = globalThis.fetch;
  globalThis.fetch = handler;
  try { return await callback(); }
  finally { globalThis.fetch = real; }
}

test('a temporary Account 503 does not erase an expired browser session', async () => {
  let attempts = 0;
  await withMockFetch(async () => { attempts++; return new Response('', { status: 503 }); }, async () => {
    const result = await loadSession(await makeRequest(), env);
    assert.equal(attempts, 2);
    assert.equal(result.session, null);
    assert.equal(result.reason, 'refresh_temporarily_unavailable');
    assert.equal(result.cookie, null);
  });
});

test('session API returns retriable 503 instead of redirect-triggering 401', async () => {
  await withMockFetch(async () => new Response('', {status:503}), async () => {
    const response = await getSession({request: await makeRequest('/api/meo/session'), env});
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('Retry-After'), '2');
    assert.equal(response.headers.get('Set-Cookie'), null);
    assert.equal((await response.json()).error.code, 'session_temporarily_unavailable');
  });
});

test('API gateway denies access but preserves encrypted cookie on temporary outage', async () => {
  await withMockFetch(async () => new Response('', {status:503}), async () => {
    const response = await proxy({ request: await makeRequest(), env });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('Set-Cookie'), null);
    assert.equal((await response.json()).error.code, 'session_temporarily_unavailable');
  });
});

test('terminal invalid_grant still clears the gateway browser session', async () => {
  let calls = 0;
  await withMockFetch(async () => { calls++; return Response.json({error:'invalid_grant'},{status:400}); }, async () => {
    const response = await proxy({ request: await makeRequest(), env });
    assert.equal(response.status, 401);
    assert.ok(response.headers.get('Set-Cookie')?.includes('Max-Age=0'));
    assert.equal(calls, 1);
  });
});

test('network outages preserve browser cookies without accessing protected API', async () => {
  await withMockFetch(async () => { throw Error('network disconnected'); }, async () => {
    const response = await proxy({ request: await makeRequest(), env });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('Set-Cookie'), null);
  });
});

test('recovered Account grants refresh tokens normally and rotate session cookie', async () => {
  await withMockFetch(async () => Response.json({access_token:'renewed',refresh_token:'rotated',expires_in:900}), async () => {
    const result = await loadSession(await makeRequest(), env);
    assert.equal(result.reason, 'refreshed');
    assert.equal(result.session.accessToken, 'renewed');
    assert.equal(result.session.refreshToken, 'rotated');
    assert.ok(result.cookie?.includes('Max-Age='));
  });
});

test('UserInfo 503 preserves a freshly rotated session cookie', async () => {
  let calls = 0;
  await withMockFetch(async (url) => {
    calls++;
    if (String(url).includes('/oauth2/token'))
      return Response.json({access_token:'fresh-access',refresh_token:'fresh-refresh',expires_in:900});
    return new Response('', {status:503});
  }, async () => {
    const response = await getSession({request:await makeRequest('/api/meo/session'),env});
    assert.equal(response.status,503);
    assert.equal((await response.json()).error.code,'session_temporarily_unavailable');
    assert.ok(response.headers.get('Set-Cookie')?.includes('__Host-meo-session='));
    assert.ok(calls >= 2);
  });
});

test('UserInfo 401 remains a rejected identity rather than transient', async () => {
  await withMockFetch(async (url) => {
    if (String(url).includes('/oauth2/token'))
      return Response.json({access_token:'fresh-access',refresh_token:'fresh-refresh',expires_in:900});
    return Response.json({error:'invalid_token'},{status:401});
  }, async () => {
    const response = await getSession({request:await makeRequest('/api/meo/session'),env});
    assert.equal(response.status,401);
  });
});
