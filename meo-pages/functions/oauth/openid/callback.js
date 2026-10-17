import {
  OAuthTokenExchangeError,
  accountUser,
  callbackUrl,
  exchangeCode,
} from '../../_lib/account.js';
import { seal, sessionCookieHeader, stateCookieValue, unseal } from '../../_lib/session.js';

function fail(reason) {
  // Keep OAuth diagnostics useful without logging authorization codes, state,
  // cookies, access tokens, or provider responses. These fixed stage labels
  // are safe to show in the callback response when production logging is not
  // available.
  console.warn('meo_oauth_callback_failed', { reason });
  return new Response(`Meo Account sign-in failed (${reason}). Return to Meo AI and try again.`, {
    status: 400,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Meo-OAuth-Failure': reason,
    },
  });
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code') ?? '';
  const state = url.searchParams.get('state') ?? '';
  const flow = await unseal(stateCookieValue(request), env);
  if (!code) return fail('missing_code');
  if (!state) return fail('missing_state');
  if (!flow) return fail('state_cookie_missing_or_invalid');
  if (flow.state !== state) return fail('state_mismatch');
  if (Date.now() - Number(flow.createdAt) > 600_000) return fail('state_expired');

  let tokens;
  try {
    tokens = await exchangeCode(env, code, flow.verifier, callbackUrl(request));
  } catch (error) {
    if (error instanceof OAuthTokenExchangeError) {
      return fail(error.reason);
    }
    return fail('code_exchange_failed');
  }
  if (!tokens?.access_token || !tokens?.refresh_token) return fail('invalid_token_response');

  let user;
  try {
    user = await accountUser(env, tokens.access_token);
  } catch {
    return fail('account_user_lookup_failed');
  }
  if (!user) return fail('account_user_lookup_failed');

  let cookie;
  try {
    const session = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt:
        Number(tokens.expires_at) ||
        Math.floor(Date.now() / 1000) + Number(tokens.expires_in ?? 3600),
      userId: user.id,
    };
    cookie = await seal(session, env);
  } catch {
    return fail('session_cookie_creation_failed');
  }
  if (cookie.length > 3800) return fail('session_cookie_too_large');

  try {
    // Cloudflare Pages must preserve this as one Set-Cookie response header.
    // Sending the two state-cookie cleanup headers alongside it has caused
    // browsers to complete the redirect while dropping the new session cookie.
    // The state cookie is short-lived (ten minutes) and is overwritten on the
    // next authorization attempt, so letting it expire is the safe fallback.
    return new Response(null, {
      status: 302,
      headers: {
        Location:
          typeof flow.returnTo === 'string' && flow.returnTo.startsWith('/new')
            ? flow.returnTo
            : '/new',
        'Cache-Control': 'no-store',
        'Set-Cookie': sessionCookieHeader(cookie),
      },
    });
  } catch {
    return fail('callback_response_failed');
  }
}
