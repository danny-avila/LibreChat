import { accountUser, loadSession } from '../../_lib/account.js';

const headers = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
};

function json(body, status = 200) {
  return Response.json(body, { status, headers });
}

export async function onRequestGet({ request, env }) {
  const { session, cookie } = await loadSession(request, env);
  if (!session) return json({ error: { code: 'unauthenticated' } }, 401);

  const account = await accountUser(env, session.accessToken).catch(() => null);
  if (!account || account.id !== session.userId) {
    return json({ error: { code: 'invalid_session' } }, 401);
  }

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
  });
  if (cookie) response.headers.append('Set-Cookie', cookie);
  return response;
}

export function onRequest() {
  return json({ error: { code: 'method_not_allowed' } }, 405);
}
