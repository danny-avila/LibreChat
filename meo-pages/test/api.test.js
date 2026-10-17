import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/[[path]].js';
import { onRequest as meoOnRequest } from '../functions/api/meo/[[path]].js';
import { seal, sessionCookieHeader } from '../functions/_lib/session.js';

const env = {
  MEO_ACCOUNT_URL: 'https://account.meoarch.org',
  MEO_API_URL: 'https://api.meoarch.org',
  MEO_OAUTH_CLIENT_ID: 'public-test-client',
  SESSION_SECRET: 'A'.repeat(43),
};
const userId = '00000000-0000-4000-8000-000000000001';

function oidcUser(email = '') {
  return { sub: userId, ...(email ? { email } : {}) };
}

test('session exposes the current account email for the switcher', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => Response.json(oidcUser('tester@example.com'));
  const response = await onRequest({ request: await request('/api/session'), env });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { userId, email: 'tester@example.com' });
});

async function request(path, init = {}) {
  const cookie = sessionCookieHeader(
    await seal(
      {
        accessToken: 'test-access',
        refreshToken: 'test-refresh',
        userId,
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      },
      env,
    ),
  ).split(';')[0];
  return new Request(`https://chat.meoarch.org${path}`, {
    ...init,
    headers: { Cookie: cookie, Origin: 'https://chat.meoarch.org', ...init.headers },
  });
}

test('history pagination uses an owner-scoped stable cursor', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const rows = Array.from({ length: 51 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    title: `Chat ${index}`,
    updated_at: '2026-10-11T09:00:00+00:00',
  }));
  const upstreamCursor = Buffer.from(JSON.stringify([rows[49].updated_at, rows[49].id])).toString(
    'base64url',
  );
  const apiUrls = [];
  globalThis.fetch = async (input) => {
    if (String(input).endsWith('/v1/auth/oauth2/userinfo')) return Response.json(oidcUser());
    apiUrls.push(String(input));
    const url = new URL(String(input));
    const cursor = url.searchParams.get('cursor');
    return Response.json({
      conversations: rows.slice(0, 50),
      nextCursor: cursor ? null : upstreamCursor,
    });
  };
  const first = await onRequest({ request: await request('/api/conversations'), env });
  assert.equal(first.status, 200);
  const page = await first.json();
  assert.equal(page.conversations.length, 50);
  assert.equal(page.nextCursor, upstreamCursor);
  assert.equal(new URL(apiUrls[0]).pathname, '/v1/conversations');
  await onRequest({
    request: await request(`/api/conversations?cursor=${encodeURIComponent(page.nextCursor)}`),
    env,
  });
  assert.equal(new URL(apiUrls[1]).searchParams.get('cursor'), upstreamCursor);
  const invalid = await onRequest({ request: await request('/api/conversations?cursor=bad'), env });
  assert.equal(invalid.status, 400);
});

test('stream failure keeps status and hides provider response text', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (input) => {
    if (String(input).endsWith('/v1/auth/oauth2/userinfo')) return Response.json(oidcUser());
    return Response.json({ error: 'private provider diagnostic' }, { status: 429 });
  };
  const result = await onRequest({
    request: await request('/api/chat/stream', {
      method: 'POST',
      body: JSON.stringify({
        credentialId: 'credential-1',
        model: 'model-1',
        messages: [{ role: 'user', content: 'hello' }],
        consent: { requestId: 'request-1', payloadSha256: 'hash', confirmationVersion: 1 },
      }),
    }),
    env,
  });
  assert.equal(result.status, 429);
  assert.doesNotMatch(JSON.stringify(await result.json()), /private provider diagnostic/);
});

test('Meo chat routes translate to the AI broker protocol', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  let upstream;
  globalThis.fetch = async (input, init) => {
    upstream = { url: String(input), init };
    return Response.json({ consent: { requestId: 'request-1' } });
  };
  const response = await meoOnRequest({
    request: await request('/api/meo/chat/prepare', {
      method: 'POST',
      body: JSON.stringify({
        credentialId: 'credential-1',
        model: 'model-1',
        prompt: 'hello',
      }),
    }),
    env,
  });
  assert.equal(response.status, 200);
  assert.equal(upstream.url, 'https://api.meoarch.org/v1/ai/provider-broker');
  assert.equal(upstream.init.method, 'POST');
  assert.deepEqual(JSON.parse(upstream.init.body), {
    action: 'prepare_inference',
    credentialId: 'credential-1',
    clientId: 'public-test-client',
    purpose: 'meo_ai_web_chat',
    dataCategories: ['chat_text'],
    model: 'model-1',
    userPrompt: 'hello',
    temperature: 0.7,
    maxOutputTokens: 2048,
  });
});

for (const code of [
  'email_verification_required',
  'account_activation_required',
  'unknown_private_code',
]) {
  test(`Account restriction exposes only approved code: ${code}`, async (t) => {
    const originalFetch = globalThis.fetch;
    t.after(() => {
      globalThis.fetch = originalFetch;
    });
    globalThis.fetch = async (input) => {
      if (String(input).endsWith('/v1/auth/oauth2/userinfo')) return Response.json(oidcUser());
      return Response.json({ error: { code, detail: 'private diagnostic' } }, { status: 403 });
    };
    const result = await onRequest({ request: await request('/api/conversations'), env });
    assert.equal(result.status, 403);
    const payload = await result.json();
    assert.equal(payload.code, code === 'unknown_private_code' ? undefined : code);
    assert.doesNotMatch(JSON.stringify(payload), /private diagnostic|unknown_private_code/);
  });
}
