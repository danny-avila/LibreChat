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

async function request(path, init = {}, expiresAt = Math.floor(Date.now() / 1000) + 3600) {
  const cookie = sessionCookieHeader(
    await seal(
      {
        accessToken: 'test-access',
        refreshToken: 'test-refresh',
        userId,
        expiresAt,
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

for (const operation of ['prepare', 'stream']) {
  test(`Meo chat ${operation} forwards context and consent unchanged to shared Chat`, async (t) => {
    const originalFetch = globalThis.fetch;
    t.after(() => {
      globalThis.fetch = originalFetch;
    });
    let upstream;
    const payload = {
      credentialId: '00000000-0000-4000-8000-000000000002',
      model: 'model-1',
      conversationId: '00000000-0000-4000-8000-000000000003',
      prompt: '  Continue our previous decision.  ',
      ...(operation === 'stream'
        ? {
            consent: { requestId: 'request-1', payloadSha256: 'hash', confirmationVersion: 1 },
          }
        : {}),
    };
    const body = JSON.stringify(payload, null, 2);
    globalThis.fetch = async (input, init) => {
      upstream = { url: String(input), init };
      return Response.json({ consent: { requestId: 'request-1' } });
    };
    const response = await meoOnRequest({
      request: await request(`/api/meo/chat/${operation}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body,
      }),
      env,
    });
    assert.equal(response.status, 200);
    assert.equal(upstream.url, `https://api.meoarch.org/v1/chat/${operation}`);
    assert.equal(upstream.init.method, 'POST');
    assert.equal(new TextDecoder().decode(upstream.init.body), body);
    assert.equal(upstream.init.headers.get('Authorization'), 'Bearer test-access');
    assert.equal(upstream.init.headers.get('Accept'), 'text/event-stream');
    assert.equal(upstream.init.redirect, 'manual');
  });
}

test('Meo stream passes through incremental events and request cancellation', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  let streamController;
  let upstreamSignal;
  globalThis.fetch = async (_input, init) => {
    upstreamSignal = init.signal;
    return new Response(
      new ReadableStream({
        start(controller) {
          streamController = controller;
        },
      }),
      { headers: { 'Content-Type': 'text/event-stream', 'X-Accel-Buffering': 'no' } },
    );
  };
  const controller = new AbortController();
  const response = await meoOnRequest({
    request: await request('/api/meo/chat/stream', {
      method: 'POST',
      body: '{}',
      signal: controller.signal,
    }),
    env,
  });
  assert.equal(response.headers.get('Content-Type'), 'text/event-stream');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('X-Accel-Buffering'), 'no');
  const reader = response.body.getReader();
  const event = 'event: delta\ndata: {"text":"hello"}\n\n';
  streamController.enqueue(new TextEncoder().encode(event));
  assert.equal(new TextDecoder().decode((await reader.read()).value), event);
  controller.abort();
  assert.equal(upstreamSignal?.aborted, true);
  streamController.close();
  await reader.cancel();
});

test('Meo shared Chat auth failure preserves the browser session', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () =>
    Response.json({ error: { code: 'unauthenticated' } }, { status: 401 });
  const response = await meoOnRequest({
    request: await request('/api/meo/chat/prepare', { method: 'POST', body: '{}' }),
    env,
  });
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('X-Meo-Upstream-Auth-Failure'), '1');
  assert.equal(response.headers.get('Set-Cookie'), null);
  assert.deepEqual(await response.json(), { error: { code: 'unauthenticated' } });
});

test('Meo shared Chat rejects cross-origin writes before forwarding', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => assert.fail('cross-origin request must not reach upstream');
  const response = await meoOnRequest({
    request: await request('/api/meo/chat/stream', {
      method: 'POST',
      headers: { Origin: 'https://other.example' },
      body: '{}',
    }),
    env,
  });
  assert.equal(response.status, 403);
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

test('Meo shared Chat forwards a refreshed token and renews the HttpOnly cookie', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const calls = [];
  globalThis.fetch = async (input, init) => {
    calls.push(String(input));
    if (String(input).endsWith('/v1/auth/oauth2/token')) {
      return Response.json({
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        expires_in: 3600,
      });
    }
    assert.equal(init.headers.get('Authorization'), 'Bearer new-access');
    return Response.json({ consent: { requestId: 'request-1' } });
  };
  const response = await meoOnRequest({
    request: await request('/api/meo/chat/prepare', { method: 'POST', body: '{}' }, 1),
    env,
  });
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [
    'https://account.meoarch.org/v1/auth/oauth2/token',
    'https://api.meoarch.org/v1/chat/prepare',
  ]);
  assert.match(response.headers.get('Set-Cookie'), /HttpOnly/);
  assert.doesNotMatch(await response.text(), /new-access|new-refresh/);
});

test('Meo connection discovery retains its broker transport', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), 'https://api.meoarch.org/v1/ai/provider-broker');
    assert.deepEqual(JSON.parse(init.body), { action: 'list_credentials' });
    return Response.json({ credentials: [] });
  };
  const response = await meoOnRequest({ request: await request('/api/meo/connections'), env });
  assert.equal(response.status, 200);
});
