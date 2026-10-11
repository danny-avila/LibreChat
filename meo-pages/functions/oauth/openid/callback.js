import { accountUser, callbackUrl, exchangeCode } from '../../_lib/account.js';
import {
  clearCookies,
  cookieValue,
  seal,
  sessionCookieHeader,
  stateCookieName,
  unseal,
} from '../../_lib/session.js';

function fail() {
  return new Response('Meo Account sign-in failed. Return to Meo AI and try again.', {
    status: 400,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code') ?? '';
  const state = url.searchParams.get('state') ?? '';
  const flow = await unseal(cookieValue(request, stateCookieName), env);
  if (
    !code ||
    !state ||
    !flow ||
    flow.state !== state ||
    Date.now() - Number(flow.createdAt) > 600_000
  ) {
    return fail();
  }
  try {
    const tokens = await exchangeCode(env, code, flow.verifier, callbackUrl(request));
    if (!tokens?.access_token || !tokens?.refresh_token) return fail();
    const user = await accountUser(env, tokens.access_token);
    if (!user) return fail();
    const session = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt:
        Number(tokens.expires_at) ||
        Math.floor(Date.now() / 1000) + Number(tokens.expires_in ?? 3600),
      userId: user.id,
    };
    const cookie = await seal(session, env);
    if (cookie.length > 3800)
      return new Response('Account session is too large for this browser.', { status: 500 });
    return new Response(null, {
      status: 302,
      headers: [
        [
          'Location',
          typeof flow.returnTo === 'string' && flow.returnTo.startsWith('/new')
            ? flow.returnTo
            : '/new',
        ],
        ['Cache-Control', 'no-store'],
        ['Set-Cookie', sessionCookieHeader(cookie)],
        ['Set-Cookie', clearCookies()[1]],
      ],
    });
  } catch {
    return fail();
  }
}
