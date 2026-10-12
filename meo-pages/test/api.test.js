import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest, parseConversationCursor } from '../functions/api/[[path]].js';
import { seal, sessionCookieHeader } from '../functions/_lib/session.js';

const env = {
  SUPABASE_URL: 'https://bdyhkkgwhcamfyoqcthx.supabase.co',
  SUPABASE_ANON_KEY: 'public-test-key',
  MEO_OAUTH_CLIENT_ID: 'public-test-client',
  SESSION_SECRET: 'A'.repeat(43),
};
const userId = '00000000-0000-4000-8000-000000000001';

test('session exposes the current account email for the switcher', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => Response.json({ sub: userId, email: 'tester@example.com' });
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
  const dbUrls = [];
  globalThis.fetch = async (input) => {
    if (String(input).endsWith('/auth/v1/oauth/userinfo')) return Response.json({ sub: userId });
    dbUrls.push(String(input));
    return Response.json(rows);
  };
  const first = await onRequest({ request: await request('/api/conversations'), env });
  assert.equal(first.status, 200);
  const page = await first.json();
  assert.equal(page.conversations.length, 50);
  assert.deepEqual(parseConversationCursor(page.nextCursor), {
    updatedAt: '2026-10-11T09:00:00+00:00',
    id: rows[49].id,
  });
  assert.equal(new URL(dbUrls[0]).searchParams.get('user_id'), `eq.${userId}`);
  assert.equal(new URL(dbUrls[0]).searchParams.get('limit'), '51');
  await onRequest({
    request: await request(`/api/conversations?cursor=${encodeURIComponent(page.nextCursor)}`),
    env,
  });
  assert.match(new URL(dbUrls[1]).searchParams.get('or'), /id\.lt\./);
  assert.equal(new URL(dbUrls[1]).searchParams.get('user_id'), `eq.${userId}`);
  const invalid = await onRequest({ request: await request('/api/conversations?cursor=bad'), env });
  assert.equal(invalid.status, 400);
});

test('stream failure keeps status and hides provider response text', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (input) => {
    if (String(input).endsWith('/auth/v1/oauth/userinfo')) return Response.json({ sub: userId });
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
