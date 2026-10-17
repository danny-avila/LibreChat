import { accountUser, loadSession } from '../../_lib/account.js';

const baseHeaders = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
};

function json(body, status = 200, extraHeaders = {}) {
  return Response.json(body, {
    status,
    headers: { ...baseHeaders, ...extraHeaders },
  });
}

function fail(reason, code = 'unauthenticated') {
  console.warn('meo_session_failed', { reason });
  return json(
    { error: { code } },
    401,
    {
      'X-Meo-Session-Failure': reason,
    },
  );
}

export async function onRequestGet({ request, env }) {
  const { session, cookie, reason } = await loadSession(request, env);
  if (!session) return fail(reason ?? 'session_unavailable');

  let account;
  try {
    account = await accountUser(env, session.accessToken);
  } catch {
    return fail('userinfo_request_failed', 'invalid_session');
  }
  if (!account) return fail('userinfo_invalid', 'invalid_session');
  if (account.id !== session.userId) return fail('subject_mismatch', 'invalid_session');

  const response = json({
    user: {
      id: account.id,
      ...(typeof account.email === 'string' ? { email: account.email } : {}),
      ...(typeof account.name === 'string' ? { name: account.name } : {}),
      ...(typeof account.preferred_username === 'string'
        ? { preferred_username: account.preferred_username }
        : {}),
      ...(typeof account.picture === 'string' ? { picture: account.picture } : {}),
    },
  }, 200, { 'X-Meo-Session-Status': reason ?? 'ok' });
  if (cookie) response.headers.append('Set-Cookie', cookie);
  return response;
}

export function onRequest() {
  return json({ error: { code: 'method_not_allowed' } }, 405);
}
