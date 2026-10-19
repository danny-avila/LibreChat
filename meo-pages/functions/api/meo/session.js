import { AccountUserInfoUnavailable, accountUser, loadSession } from '../../_lib/account.js';

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
  // Never redirect a valid user to login merely because token refresh hit
  // a transient Account 503. The browser must not receive any user data here.
  const transient = reason === 'refresh_temporarily_unavailable' ||
    reason === 'userinfo_temporarily_unavailable';
  console.warn('meo_session_failed', { reason });
  return json(
    { error: { code: transient ? 'session_temporarily_unavailable' : code } },
    transient ? 503 : 401,
    {
      'X-Meo-Session-Failure': reason,
      ...(transient ? { 'Retry-After': '2' } : {}),
    },
  );
}

export async function onRequestGet({ request, env }) {
  const { session, cookie, reason } = await loadSession(request, env);
  if (!session) return fail(reason ?? 'session_unavailable');

  let account;
  try {
    account = await accountUser(env, session.accessToken);
  } catch (error) {
    if (error instanceof AccountUserInfoUnavailable) {
      const response = fail('userinfo_temporarily_unavailable');
      // If the token was successfully refreshed first, persist its rotated
      // grant even though UserInfo is down, avoiding invalid_grant next time.
      if (cookie) response.headers.append('Set-Cookie', cookie);
      return response;
    }
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
