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

test('Meo chat forwards conversation identity and consent to shared Meo API', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const upstream = [];
  globalThis.fetch = async (input, init) => {
    upstream.push({ url: String(input), method: init.method, body: JSON.parse(new TextDecoder().decode(init.body)) });
    return Response.json({ consent: { requestId: 'request-1' } });
  };
  const conversationId = '00000000-0000-4000-8000-000000000099';
  const requestBody = { credentialId: 'credential-1', model: 'model-1', prompt: 'hello', conversationId };
  const prep = await meoOnRequest({
    request: await request('/api/meo/chat/prepare', { method: 'POST', body: JSON.stringify(requestBody) }), env,
  });
  assert.equal(prep.status, 200);
  const consent = { requestId: 'request-1', payloadSha256: 'hash', confirmationVersion: 1 };
  const stream = await meoOnRequest({
    request: await request('/api/meo/chat/stream', {
      method: 'POST', body: JSON.stringify({ ...requestBody, consent }),
    }), env,
  });
  assert.equal(stream.status, 200);
  assert.deepEqual(upstream, [
    { url: 'https://api.meoarch.org/v1/chat/prepare', method: 'POST', body: requestBody },
    { url: 'https://api.meoarch.org/v1/chat/stream', method: 'POST', body: { ...requestBody, consent } },
  ]);
});

test('Meo settings and memories use the owner-authenticated shared API', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const upstream = [];
  globalThis.fetch = async (input, init) => {
    upstream.push({ url: String(input), method: init.method, authorization: init.headers.get('Authorization') });
    return Response.json({ ok: true });
  };
  const id = '00000000-0000-4000-8000-000000000021';
  for (const [path, method, body] of [
    ['/api/meo/settings', 'GET', undefined],
    ['/api/meo/settings', 'PATCH', JSON.stringify({ expectedVersion: 0, memoryEnabled: false })],
    ['/api/meo/memories?archived=true', 'GET', undefined],
    ['/api/meo/memories', 'POST', JSON.stringify({ kind: 'preference', content: 'Test' })],
    [`/api/meo/memories/${id}`, 'PATCH', JSON.stringify({ expectedVersion: 1, enabled: false })],
    [`/api/meo/memories/${id}`, 'DELETE', undefined],
  ]) {
    const response = await meoOnRequest({ request: await request(path, { method, body }), env });
    assert.equal(response.status, 200);
  }
  assert.deepEqual(upstream.map((v) => [new URL(v.url).pathname, v.method]), [
    ['/v1/ai/settings', 'GET'],
    ['/v1/ai/settings', 'PATCH'],
    ['/v1/ai/memories', 'GET'],
    ['/v1/ai/memories', 'POST'],
    [`/v1/ai/memories/${id}`, 'PATCH'],
    [`/v1/ai/memories/${id}`, 'DELETE'],
  ]);
  assert.equal(new URL(upstream[2].url).searchParams.get('archived'), 'true');
  assert.ok(upstream.every((v) => v.authorization === 'Bearer test-access'));
});

test('Meo Projects routes use the shared owner-scoped API', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const upstream = [];
  globalThis.fetch = async (input, init) => {
    upstream.push({
      url: String(input),
      method: init.method,
      authorization: init.headers.get('Authorization'),
      body: init.body instanceof ArrayBuffer
        ? new TextDecoder().decode(init.body)
        : typeof init.body === 'string' ? init.body : '',
    });
    return Response.json({ ok: true });
  };
  const id = '00000000-0000-4000-8000-000000000044';
  const cases = [
    ['/api/meo/projects?cursor=page2', 'GET', undefined],
    ['/api/meo/projects', 'POST', { name: 'Project A' }],
    [`/api/meo/projects/${id}`, 'GET', undefined],
    [`/api/meo/projects/${id}`, 'PATCH', { instructions: 'Be concise' }],
    [`/api/meo/projects/${id}/memories`, 'GET', undefined],
    [`/api/meo/projects/${id}/memories`, 'POST', { content: 'Project note' }],
  ];
  for (const [path, method, payload] of cases) {
    const response = await meoOnRequest({
      request: await request(path, {
        method,
        ...(payload ? { body: JSON.stringify(payload) } : {}),
      }),
      env,
    });
    assert.equal(response.status, 200, `${method} ${path}`);
  }
  assert.deepEqual(upstream.map(({ url, method }) => [new URL(url).pathname, method]), [
    ['/v1/projects', 'GET'], ['/v1/projects', 'POST'],
    [`/v1/projects/${id}`, 'GET'], [`/v1/projects/${id}`, 'PATCH'],
    [`/v1/projects/${id}/memories`, 'GET'],
    [`/v1/projects/${id}/memories`, 'POST'],
  ]);
  assert.equal(new URL(upstream[0].url).searchParams.get('cursor'), 'page2');
  assert.deepEqual(JSON.parse(upstream[1].body), { name: 'Project A' });
  assert.ok(upstream.every((item) => item.authorization === 'Bearer test-access'));

  const before = upstream.length;
  const invalid = await meoOnRequest({
    request: await request('/api/meo/projects/../account', { method: 'PATCH', body: '{}' }),
    env,
  });
  assert.equal(invalid.status, 404);
  assert.equal(upstream.length, before);
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
